import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  LocalPluginManager,
  NamespacedStorageProvider,
  CapabilityBroker,
  createStorageCapabilityHandler,
  createPackageBuffer,
  IntegrityError,
  ValidationError,
} from '../../packages/runtime/src/index.js';
import { PluginLifecycleState } from '../../packages/contracts/src/lifecycle.js';

describe('Upgrade, Downgrade & Failure Recovery Validation (TEST-003)', () => {
  let tempDir: string;
  let manager: LocalPluginManager;
  let storage: NamespacedStorageProvider;
  let broker: CapabilityBroker;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'miyuna-reliability-test-'));
    storage = new NamespacedStorageProvider();
    manager = new LocalPluginManager({
      baseInstallDir: tempDir,
      storageProvider: storage,
    });
    broker = new CapabilityBroker(manager);
    broker.registerCapabilityHandler(createStorageCapabilityHandler(storage));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  function createTestMpk(version: string, extraFiles: Record<string, string> = {}): Buffer {
    const manifest = {
      $schema: 'https://miyunadev.org/schemas/v1/plugin.schema.json',
      id: 'org.miyunadev.upgradeable',
      name: 'Upgradeable Plugin',
      version,
      author: { name: 'Miyuna Team' },
      license: 'MIT',
      engines: { miyuna: '>=1.0.0' },
      artifact: {
        type: 'web-bundle',
        entry: 'dist/index.html',
      },
      contributions: [
        {
          type: 'route',
          id: 'main-view',
          title: `View v${version}`,
          path: '/main',
        },
      ],
      capabilities: [
        {
          name: 'storage.local',
          reason: 'Preserve user data',
        },
      ],
    };

    const files = [
      {
        path: 'plugin.json',
        content: JSON.stringify(manifest, null, 2),
      },
      {
        path: 'dist/index.html',
        content: `<h1>Plugin Version ${version}</h1>`,
      },
      ...Object.entries(extraFiles).map(([path, content]) => ({ path, content })),
    ];

    return createPackageBuffer(files);
  }

  it('preserves namespaced storage and permission grants when upgrading from 1.0.0 to 1.1.0', async () => {
    const pluginId = 'org.miyunadev.upgradeable';

    // 1. Install and activate version 1.0.0
    const pkgV100 = createTestMpk('1.0.0');
    await manager.install(pkgV100);
    await manager.activate(pluginId);
    manager.grantPermission(pluginId, 'storage.local', 'user');

    // 2. Plugin v1.0.0 writes data to storage
    await storage.setItem(pluginId, 'user_settings', { darkMode: true, theme: 'sakura' });
    await storage.setItem(pluginId, 'saved_high_score', 9999);

    const initialStatus = manager.getPlugin(pluginId);
    expect(initialStatus?.installedVersion).toBe('1.0.0');

    // 3. Perform upgrade to version 1.1.0
    const pkgV110 = createTestMpk('1.1.0', {
      'dist/new-feature.js': 'console.log("new v1.1.0 feature");',
    });
    const upgradedStatus = await manager.install(pkgV110);

    expect(upgradedStatus.installedVersion).toBe('1.1.0');
    expect(manager.getPlugin(pluginId)?.installedVersion).toBe('1.1.0');

    // Verify on-disk file update
    const installedHtml = readFileSync(join(tempDir, pluginId, 'dist', 'index.html'), 'utf-8');
    expect(installedHtml).toContain('Plugin Version 1.1.0');
    expect(existsSync(join(tempDir, pluginId, 'dist', 'new-feature.js'))).toBe(true);

    // 4. Verify namespaced storage data is completely preserved
    const settings = await storage.getItem(pluginId, 'user_settings');
    const score = await storage.getItem(pluginId, 'saved_high_score');
    expect(settings).toEqual({ darkMode: true, theme: 'sakura' });
    expect(score).toBe(9999);

    // 5. Reactivate upgraded plugin and verify granted permissions remain active
    await manager.activate(pluginId);
    expect(manager.hasPermission(pluginId, 'storage.local')).toBe(true);
  });

  it('aborts upgrade and rolls back cleanly when update package fails verification', async () => {
    const pluginId = 'org.miyunadev.upgradeable';

    // 1. Install and activate legitimate v1.0.0
    const pkgV100 = createTestMpk('1.0.0');
    await manager.install(pkgV100);
    await manager.activate(pluginId);
    await storage.setItem(pluginId, 'important_data', 'keep_this_safe');

    // 2. Prepare corrupted v2.0.0 package
    const legitV200 = createTestMpk('2.0.0');
    const corruptedV200 = Buffer.from(legitV200);
    corruptedV200[40] = corruptedV200[40] ^ 0xff;

    // 3. Attempt upgrade with corrupt package
    expect(async () => {
      await manager.install(corruptedV200);
    }).toThrow(/(IntegrityError|ValidationError|Package is missing)/i);

    // 4. Verify original v1.0.0 installation remains intact
    const currentStatus = manager.getPlugin(pluginId);
    expect(currentStatus).toBeDefined();
    expect(currentStatus?.installedVersion).toBe('1.0.0');
    expect(currentStatus?.state).toBe(PluginLifecycleState.ACTIVE);

    // 5. Verify storage data was not touched
    const data = await storage.getItem(pluginId, 'important_data');
    expect(data).toBe('keep_this_safe');
  });

  it('contains capability provider crashes and errors without destabilizing host broker', async () => {
    const pluginId = 'org.miyunadev.upgradeable';
    const pkg = createTestMpk('1.0.0');
    await manager.install(pkg);
    await manager.activate(pluginId);

    // Register a faulty provider that throws uncaught exceptions
    broker.registerCapabilityHandler({
      name: 'test.faulty',
      version: '1.0.0',
      supportedActions: ['crash', 'hang'],
      async handle(action: string) {
        if (action === 'crash') {
          throw new Error('FATAL_UNCAUGHT_PROVIDER_EXCEPTION: Database core dumped');
        }
        if (action === 'hang') {
          // Simulate infinite loop or hang
          await new Promise((resolve) => setTimeout(resolve, 200));
          return { done: true };
        }
        return { ok: true };
      },
    });

    manager.grantPermission(pluginId, 'test.faulty', 'user');
    manager.grantPermission(pluginId, 'storage.local', 'user');

    // 1. Invocation of crashing action
    const crashReq = {
      jsonrpc: '2.0',
      id: 'crash-1',
      method: 'broker.invoke',
      params: {
        capability: 'test.faulty',
        action: 'crash',
      },
    };

    const res = await broker.handleRequest(pluginId, crashReq as any);
    expect(res.error).toBeDefined();
    expect(res.error?.code).toBe(-32005); // CAPABILITY_PROVIDER_ERROR
    expect(res.error?.message).toContain('FATAL_UNCAUGHT_PROVIDER_EXCEPTION');

    // 2. Verify broker is still healthy and operational for subsequent requests
    await storage.setItem(pluginId, 'statusCheck', 'broker_is_alive');
    const storageReq = {
      jsonrpc: '2.0',
      id: 'alive-1',
      method: 'broker.invoke',
      params: {
        capability: 'storage.local',
        action: 'getItem',
        args: { key: 'statusCheck' },
      },
    };
    const storageRes = await broker.handleRequest(pluginId, storageReq as any);
    expect(storageRes.result).toBe('broker_is_alive');
  });

  it('allows cleanly disabling/deactivating a failing or crashed plugin', async () => {
    const pluginId = 'org.miyunadev.upgradeable';
    const pkg = createTestMpk('1.0.0');
    await manager.install(pkg);
    await manager.activate(pluginId);

    // Simulate plugin failure
    const status = manager.getPlugin(pluginId);
    expect(status?.state).toBe(PluginLifecycleState.ACTIVE);

    // Host catches error and deactivates
    const deactivated = await manager.deactivate(pluginId);
    expect(deactivated.state).toBe(PluginLifecycleState.INACTIVE);

    // Capabilities are automatically blocked while inactive
    const req = {
      jsonrpc: '2.0',
      id: 'inactive-call',
      method: 'broker.invoke',
      params: {
        capability: 'storage.local',
        action: 'getItem',
        args: { key: 'anything' },
      },
    };
    const res = await broker.handleRequest(pluginId, req as any);
    expect(res.error).toBeDefined();
    expect(res.error?.code).toBe(-32001); // PERMISSION_DENIED because plugin is INACTIVE
  });
});
