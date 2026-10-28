import { test, describe, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

import { MockJellyfinServer } from '../../../tests/mocks/jellyfin-server/mock-server.js';
import { createPackageBuffer } from '../src/installer/packer.js';
import { LocalPluginManager } from '../src/manager/plugin-manager.js';
import { NamespacedStorageProvider } from '../src/providers/storage-provider.js';
import { SecureKeyringProvider, createKeyringCapabilityHandler } from '../src/providers/credential-provider.js';
import { NetworkProxyProvider, createNetworkCapabilityHandler } from '../src/providers/network-provider.js';
import { CapabilityBroker, createStorageCapabilityHandler } from '../src/broker/broker.js';
import { createRpcRequest } from '../../contracts/src/rpc.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const connectorDir = resolve(__dirname, '../../../examples/jellyfin-connector');

describe('Demonstration Jellyfin Connector (.mpk) Integration Test', () => {
  let mockServer: MockJellyfinServer;
  let serverBaseUrl: string;
  let tempBaseDir: string;
  let storage: NamespacedStorageProvider;
  let keyring: SecureKeyringProvider;
  let network: NetworkProxyProvider;
  let manager: LocalPluginManager;
  let broker: CapabilityBroker;

  before(async () => {
    mockServer = new MockJellyfinServer();
    serverBaseUrl = await mockServer.start();
  });

  after(async () => {
    await mockServer.stop();
  });

  beforeEach(() => {
    tempBaseDir = mkdtempSync(join(tmpdir(), 'miyuna-jellyfin-test-'));
    storage = new NamespacedStorageProvider();
    keyring = new SecureKeyringProvider();
    network = new NetworkProxyProvider({ keyring });

    manager = new LocalPluginManager({
      baseInstallDir: tempBaseDir,
      storageProvider: storage,
      networkProvider: network,
      keyringProvider: keyring,
    });

    broker = new CapabilityBroker(manager);
    broker.registerCapabilityHandler(createStorageCapabilityHandler(storage));
    broker.registerCapabilityHandler(createKeyringCapabilityHandler(keyring));
    broker.registerCapabilityHandler(createNetworkCapabilityHandler(network));
  });

  afterEach(() => {
    if (existsSync(tempBaseDir)) {
      rmSync(tempBaseDir, { recursive: true, force: true });
    }
  });

  test('packages jellyfin connector into .mpk, installs, authenticates and fetches items with credential injection', async () => {
    const pluginId = 'org.miyunadev.plugins.jellyfin-connector';

    // 1. Read connector files
    const manifestContent = readFileSync(join(connectorDir, 'plugin.json'), 'utf-8');
    const indexHtml = readFileSync(join(connectorDir, 'dist', 'index.html'), 'utf-8');
    const connectorJs = readFileSync(join(connectorDir, 'dist', 'connector.js'), 'utf-8');
    const styleCss = readFileSync(join(connectorDir, 'dist', 'style.css'), 'utf-8');
    const iconPng = readFileSync(join(connectorDir, 'assets', 'icon.png'));

    // 2. Package into .mpk archive
    const mpkBuffer = createPackageBuffer([
      { path: 'plugin.json', content: manifestContent },
      { path: 'dist/index.html', content: indexHtml },
      { path: 'dist/connector.js', content: connectorJs },
      { path: 'dist/style.css', content: styleCss },
      { path: 'assets/icon.png', content: iconPng },
    ]);

    // 3. Install via LocalPluginManager
    const installStatus = await manager.install(mpkBuffer);
    assert.equal(installStatus.pluginId, pluginId);
    assert.equal(installStatus.installedVersion, '1.0.0');

    // 4. Grant requested capabilities & activate
    manager.grantPermission(pluginId, 'network.fetch');
    manager.grantPermission(pluginId, 'auth.secureKeyring');
    manager.grantPermission(pluginId, 'storage.local');

    const activeStatus = await manager.activate(pluginId);
    assert.equal(activeStatus.enabled, true);

    // 5. Authenticate with Jellyfin via broker network.fetch
    const authReq = createRpcRequest('req-auth', 'broker.invoke', {
      capability: 'network.fetch',
      action: 'fetch',
      args: {
        url: `${serverBaseUrl}/Users/AuthenticateByName`,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ Username: 'alice', Pw: 'password123' }),
      },
    });

    const authRes = await broker.handleRequest(pluginId, authReq);
    assert.ok('result' in authRes, 'Authentication request must succeed');
    const authData = JSON.parse((authRes as any).result.body);
    const token = authData.AccessToken;
    assert.ok(token, 'Must receive AccessToken from Jellyfin');

    // 6. Store token securely in host keyring
    const storeTokenReq = createRpcRequest('req-store-token', 'broker.invoke', {
      capability: 'auth.secureKeyring',
      action: 'storeCredential',
      args: {
        credentialId: 'jellyfin_auth_token',
        secret: token,
      },
    });
    const storeTokenRes = await broker.handleRequest(pluginId, storeTokenReq);
    assert.ok('result' in storeTokenRes);

    // 7. Verify hasCredential returns true without revealing the secret
    const hasCredReq = createRpcRequest('req-has-cred', 'broker.invoke', {
      capability: 'auth.secureKeyring',
      action: 'hasCredential',
      args: { credentialId: 'jellyfin_auth_token' },
    });
    const hasCredRes = await broker.handleRequest(pluginId, hasCredReq);
    assert.ok('result' in hasCredRes);
    assert.equal((hasCredRes as any).result.exists, true);
    assert.equal((hasCredRes as any).result.secret, undefined);

    // 8. Fetch media catalog items with host token injection
    const getItemsReq = createRpcRequest('req-items', 'broker.invoke', {
      capability: 'network.fetch',
      action: 'fetch',
      args: {
        url: `${serverBaseUrl}/Items`,
        method: 'GET',
        credentialId: 'jellyfin_auth_token',
        credentialHeader: 'X-Emby-Token',
      },
    });

    const itemsRes = await broker.handleRequest(pluginId, getItemsReq);
    assert.ok('result' in itemsRes, 'Item fetch must succeed');
    assert.equal((itemsRes as any).result.status, 200);

    const catalog = JSON.parse((itemsRes as any).result.body);
    assert.equal(catalog.TotalRecordCount, 3);
    assert.equal(catalog.Items[0].Name, 'Cyberpunk: Edgerunners');
    assert.equal(catalog.Items[1].Name, "Frieren: Beyond Journey's End");
    assert.equal(catalog.Items[2].Name, 'Spirited Away');
  });
});
