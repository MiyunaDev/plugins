import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

import { createPackageBuffer } from '../src/installer/packer.js';
import { LocalPluginManager } from '../src/manager/plugin-manager.js';
import { NamespacedStorageProvider } from '../src/providers/storage-provider.js';
import { MockNaviahSyncProvider } from '../src/providers/sync-mock/mock-naviah-sync.js';
import { CapabilityBroker, createStorageCapabilityHandler } from '../src/broker/broker.js';
import { createRpcRequest } from '../../contracts/src/rpc.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const syncPluginDir = resolve(__dirname, '../../../examples/naviah-sync-ui');

describe('Demonstration Naviah Sync Workflow Plugin (.mpk) Integration Test', () => {
  let tempBaseDir: string;
  let storage: NamespacedStorageProvider;
  let syncProvider: MockNaviahSyncProvider;
  let manager: LocalPluginManager;
  let broker: CapabilityBroker;

  beforeEach(() => {
    tempBaseDir = mkdtempSync(join(tmpdir(), 'miyuna-sync-test-'));
    storage = new NamespacedStorageProvider();
    syncProvider = new MockNaviahSyncProvider({ autoProgress: true, progressIntervalMs: 20 });

    manager = new LocalPluginManager({
      baseInstallDir: tempBaseDir,
      storageProvider: storage,
    });

    broker = new CapabilityBroker(manager);
    broker.registerCapabilityHandler(createStorageCapabilityHandler(storage));
    broker.registerCapabilityHandler(syncProvider);
  });

  afterEach(() => {
    if (existsSync(tempBaseDir)) {
      rmSync(tempBaseDir, { recursive: true, force: true });
    }
  });

  test('packages naviah sync plugin into .mpk, installs, discovers peers, and controls sync session via broker', async () => {
    const pluginId = 'org.miyunadev.plugins.naviah-sync-ui';

    // 1. Read plugin files
    const manifestContent = readFileSync(join(syncPluginDir, 'plugin.json'), 'utf-8');
    const indexHtml = readFileSync(join(syncPluginDir, 'dist', 'index.html'), 'utf-8');
    const syncJs = readFileSync(join(syncPluginDir, 'dist', 'sync.js'), 'utf-8');
    const styleCss = readFileSync(join(syncPluginDir, 'dist', 'style.css'), 'utf-8');
    const iconPng = readFileSync(join(syncPluginDir, 'assets', 'icon.png'));

    // 2. Package into .mpk archive
    const mpkBuffer = createPackageBuffer([
      { path: 'plugin.json', content: manifestContent },
      { path: 'dist/index.html', content: indexHtml },
      { path: 'dist/sync.js', content: syncJs },
      { path: 'dist/style.css', content: styleCss },
      { path: 'assets/icon.png', content: iconPng },
    ]);

    // 3. Install into LocalPluginManager
    const installStatus = await manager.install(mpkBuffer);
    assert.equal(installStatus.pluginId, pluginId);
    assert.equal(installStatus.installedVersion, '1.0.0');

    // 4. Grant capability & activate
    manager.grantPermission(pluginId, 'device.naviah-sync');
    manager.grantPermission(pluginId, 'storage.local');

    const activeStatus = await manager.activate(pluginId);
    assert.equal(activeStatus.enabled, true);

    // 5. Query available capabilities
    const capsReq = createRpcRequest('req-caps', 'broker.getCapabilities');
    const capsRes = await broker.handleRequest(pluginId, capsReq);
    assert.ok('result' in capsRes);
    const availableCaps = (capsRes as any).result.capabilities;
    assert.ok(availableCaps.some((c: any) => c.name === 'device.naviah-sync'));

    // 6. Discover local peers via broker invoke
    const discoverReq = createRpcRequest('req-peers', 'broker.invoke', {
      capability: 'device.naviah-sync',
      action: 'discoverPeers',
    });
    const discoverRes = await broker.handleRequest(pluginId, discoverReq);
    assert.ok('result' in discoverRes);
    const peers = (discoverRes as any).result.peers;
    assert.ok(peers.length >= 3);
    assert.equal(peers[0].id, 'peer-desktop');

    // 7. Start synchronization session
    const startReq = createRpcRequest('req-sync-start', 'broker.invoke', {
      capability: 'device.naviah-sync',
      action: 'startSync',
      args: {
        peerId: 'peer-desktop',
        scopes: ['favorites', 'reading_history'],
      },
    });
    const startRes = await broker.handleRequest(pluginId, startReq);
    assert.ok('result' in startRes);
    const sessionId = (startRes as any).result.sessionId;
    assert.ok(sessionId.startsWith('sync-'));

    // 8. Poll sync status until completed
    let isCompleted = false;
    for (let i = 0; i < 15; i++) {
      await new Promise((r) => setTimeout(r, 20));
      const statusReq = createRpcRequest(`req-status-${i}`, 'broker.invoke', {
        capability: 'device.naviah-sync',
        action: 'getSyncStatus',
      });
      const statusRes = await broker.handleRequest(pluginId, statusReq);
      assert.ok('result' in statusRes);
      const status = (statusRes as any).result;

      if (status.state === 'completed') {
        assert.equal(status.progressPercent, 100);
        assert.ok(status.bytesTransferred > 0);
        isCompleted = true;
        break;
      }
    }

    assert.equal(isCompleted, true, 'Sync session must complete successfully within expected time');
  });
});
