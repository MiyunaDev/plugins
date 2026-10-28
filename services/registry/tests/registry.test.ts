import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { RegistryServer } from '../src/server.js';
import { PluginRegistryClient } from '../src/client.js';
import { packCommand } from '../../../packages/cli/src/commands/pack.js';
import { generateKeyPair } from '../../../packages/cli/src/crypto/ed25519.js';
import { LocalPluginManager } from '../../../packages/runtime/src/manager/plugin-manager.js';

describe('Plugin Registry Service & Store Integration (REG-001, REG-003)', () => {
  let tempDir: string;
  let server: RegistryServer;
  let client: PluginRegistryClient;
  let serverPort: number;

  beforeEach(async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'miyuna-registry-test-'));
    // Port 0 lets OS pick any free port
    server = new RegistryServer({ port: 0, host: '127.0.0.1', storageDir: join(tempDir, 'storage') });
    serverPort = await server.start();
    client = new PluginRegistryClient({ baseUrl: `http://127.0.0.1:${serverPort}` });
  });

  afterEach(async () => {
    await server.stop();
    rmSync(tempDir, { recursive: true, force: true });
  });

  function createTestPlugin(
    id: string,
    version: string,
    engineConstraint?: string
  ): { packageBuffer: Buffer; publicKeyPem: string } {
    const srcDir = join(tempDir, `src-${id}-${version}`);
    const { mkdirSync } = require('node:fs');
    mkdirSync(join(srcDir, 'dist'), { recursive: true });

    const manifest = {
      $schema: 'https://miyunadev.org/schemas/v1/plugin.schema.json',
      id,
      name: `Plugin ${id}`,
      version,
      description: `Description for ${id}`,
      author: { name: 'Miyuna Team' },
      license: 'MIT',
      engines: {
        miyuna: '>=1.0.0',
        client: engineConstraint ? { web: engineConstraint } : { web: true },
      },
      artifact: {
        type: 'web-bundle',
        entry: 'dist/index.html',
      },
      contributions: [
        {
          type: 'route',
          id: 'main-view',
          title: 'Main View',
          path: '/main',
        },
      ],
      capabilities: [],
    };

    writeFileSync(join(srcDir, 'plugin.json'), JSON.stringify(manifest, null, 2));
    writeFileSync(join(srcDir, 'dist', 'index.html'), `<h1>${id} - ${version}</h1>`);

    const keyPair = generateKeyPair();
    const privPath = join(tempDir, `${id}.priv.pem`);
    writeFileSync(privPath, keyPair.privateKeyPem);

    const outMpk = join(tempDir, `${id}-${version}.mpk`);
    const packRes = packCommand({
      sourceDir: srcDir,
      outputPath: outMpk,
      privateKeyPath: privPath,
    });

    return { packageBuffer: packRes.packageBuffer, publicKeyPem: keyPair.publicKeyPem };
  }

  it('serves healthcheck endpoint (GET /v1/health)', async () => {
    const health = await client.getHealth();
    expect(health.status).toBe('ok');
    expect(health.version).toBe('1.0.0');
    expect(typeof health.uptime).toBe('number');
  });

  it('publishes a signed package, retrieves metadata, and downloads .mpk (REG-001, REG-003)', async () => {
    const { packageBuffer, publicKeyPem } = createTestPlugin('org.miyunadev.demo', '1.0.0');

    // 1. Publish package with publisher public key
    const pubRes = await client.publishPackage(packageBuffer, { publicKey: publicKeyPem });
    expect(pubRes.success).toBe(true);
    expect(pubRes.id).toBe('org.miyunadev.demo');
    expect(pubRes.version).toBe('1.0.0');
    expect(pubRes.verifiedSignature).toBe(true);

    // 2. Retrieve plugin metadata
    const plugin = await client.getPlugin('org.miyunadev.demo');
    expect(plugin).not.toBeNull();
    expect(plugin.name).toBe('Plugin org.miyunadev.demo');
    expect(plugin.latestVersion).toBe('1.0.0');
    expect(plugin.versions).toHaveLength(1);
    expect(plugin.verifiedPublisher).toBe(true);

    // 3. Download package
    const download = await client.downloadPackage('org.miyunadev.demo', '1.0.0');
    expect(download.packageBuffer.length).toBeGreaterThan(0);
    expect(download.sha256).toBe(pubRes.sha256);
  });

  it('enforces version immutability and rejects duplicate publish (409 conflict)', async () => {
    const { packageBuffer } = createTestPlugin('org.miyunadev.immutable', '1.0.0');

    // First publish succeeds
    await client.publishPackage(packageBuffer);

    // Duplicate publish must throw 409 conflict
    expect(async () => {
      await client.publishPackage(packageBuffer);
    }).toThrow(/already exists/i);
  });

  it('rejects tampered or corrupt package during publish (400 validation error)', async () => {
    const { packageBuffer } = createTestPlugin('org.miyunadev.corrupt', '1.0.0');

    // Corrupt archive bytes
    const tampered = Buffer.from(packageBuffer);
    tampered[45] = tampered[45] ^ 0xff;

    expect(async () => {
      await client.publishPackage(tampered);
    }).toThrow(/verification failed/i);
  });

  it('filters plugins by client engine and semver compatibility', async () => {
    // Plugin A requires web >= 2.0.0
    const { packageBuffer: pkgA } = createTestPlugin('org.miyunadev.nextgen', '1.0.0', '>=2.0.0');
    // Plugin B requires web < 2.0.0
    const { packageBuffer: pkgB } = createTestPlugin('org.miyunadev.legacy', '1.0.0', '<2.0.0');

    await client.publishPackage(pkgA);
    await client.publishPackage(pkgB);

    // 1. Search for client web v1.5.0: only legacy should be compatible
    const resV1 = await client.search({
      client_engine: 'web',
      client_version: '1.5.0',
    });
    const idsV1 = resV1.items.map((i: any) => i.id);
    expect(idsV1).toContain('org.miyunadev.legacy');
    expect(idsV1).not.toContain('org.miyunadev.nextgen');

    // 2. Search for client web v2.5.0: only nextgen should be compatible
    const resV2 = await client.search({
      client_engine: 'web',
      client_version: '2.5.0',
    });
    const idsV2 = resV2.items.map((i: any) => i.id);
    expect(idsV2).toContain('org.miyunadev.nextgen');
    expect(idsV2).not.toContain('org.miyunadev.legacy');
  });

  it('downloads and installs package directly into LocalPluginManager', async () => {
    const { packageBuffer, publicKeyPem } = createTestPlugin('org.miyunadev.autoinstall', '1.2.0');
    await client.publishPackage(packageBuffer, { publicKey: publicKeyPem });

    const pluginManager = new LocalPluginManager({
      baseInstallDir: join(tempDir, 'client-plugins'),
    });

    const installed = await client.installFromRegistry(pluginManager, 'org.miyunadev.autoinstall', undefined, {
      publicKey: publicKeyPem,
      verifySignature: true,
    });
    expect(installed.pluginId).toBe('org.miyunadev.autoinstall');
    expect(installed.installedVersion).toBe('1.2.0');
    expect(installed.state).toBe('INACTIVE');

    // Activate the installed plugin
    const active = await pluginManager.activate('org.miyunadev.autoinstall');
    expect(active.state).toBe('ACTIVE');
  });
});
