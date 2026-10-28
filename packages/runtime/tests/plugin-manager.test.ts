import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalPluginManager } from '../src/manager/plugin-manager.js';
import { NamespacedStorageProvider } from '../src/providers/storage-provider.js';
import { createPackageBuffer } from '../src/installer/packer.js';
import { PluginLifecycleState } from '../../contracts/src/lifecycle.js';

describe('Local Plugin Manager Lifecycle & Permission Management', () => {
  let tempBaseDir: string;
  let storage: NamespacedStorageProvider;
  let manager: LocalPluginManager;

  beforeEach(() => {
    tempBaseDir = mkdtempSync(join(tmpdir(), 'miyuna-pm-test-'));
    storage = new NamespacedStorageProvider();
    manager = new LocalPluginManager({
      baseInstallDir: tempBaseDir,
      storageProvider: storage,
    });
  });

  afterEach(() => {
    if (existsSync(tempBaseDir)) {
      rmSync(tempBaseDir, { recursive: true, force: true });
    }
  });

  function createSamplePackage(id: string = 'org.miyunadev.sample'): Buffer {
    const manifest = {
      $schema: 'https://specs.miyunadev.org/schemas/v1/plugin.schema.json',
      id,
      name: 'Sample Plugin',
      version: '1.0.0',
      engines: { miyuna: '>=1.0.0' },
      artifact: { type: 'web-bundle', entry: 'dist/index.html' },
      capabilities: [
        { name: 'storage.local', quota: '5MB' },
        { name: 'network.fetch' },
      ],
      author: { name: 'Sample Author' },
    };

    return createPackageBuffer([
      { path: 'plugin.json', content: JSON.stringify(manifest, null, 2) },
      { path: 'dist/index.html', content: '<h1>Sample</h1>' },
    ]);
  }

  test('installs package into isolated directory and sets initial INACTIVE state', async () => {
    const pkg = createSamplePackage('org.miyunadev.test.install');
    const status = await manager.install(pkg);

    assert.equal(status.pluginId, 'org.miyunadev.test.install');
    assert.equal(status.state, PluginLifecycleState.INACTIVE);
    assert.equal(status.enabled, false);

    const record = manager.getPlugin('org.miyunadev.test.install');
    assert.ok(record !== undefined);
    assert.equal(record.installedVersion, '1.0.0');

    // Storage quota configured to 5MB (5242880 bytes)
    assert.equal(storage.getPluginQuota('org.miyunadev.test.install'), 5 * 1024 * 1024);
  });

  test('manages activation and deactivation state machine', async () => {
    const pkg = createSamplePackage('org.miyunadev.test.lifecycle');
    await manager.install(pkg);

    // Activate
    const activeStatus = await manager.activate('org.miyunadev.test.lifecycle');
    assert.equal(activeStatus.state, PluginLifecycleState.ACTIVE);
    assert.equal(activeStatus.enabled, true);

    // Deactivate
    const inactiveStatus = await manager.deactivate('org.miyunadev.test.lifecycle');
    assert.equal(inactiveStatus.state, PluginLifecycleState.INACTIVE);
    assert.equal(inactiveStatus.enabled, false);
  });

  test('enforces permissions only when plugin is active', async () => {
    const pluginId = 'org.miyunadev.test.perms';
    await manager.install(createSamplePackage(pluginId));

    manager.grantPermission(pluginId, 'storage.local');

    // Plugin is currently INACTIVE -> hasPermission must return false
    assert.equal(manager.hasPermission(pluginId, 'storage.local'), false);

    // Activate plugin -> hasPermission returns true
    await manager.activate(pluginId);
    assert.equal(manager.hasPermission(pluginId, 'storage.local'), true);

    // Revoke permission -> hasPermission returns false
    manager.revokePermission(pluginId, 'storage.local');
    assert.equal(manager.hasPermission(pluginId, 'storage.local'), false);
  });

  test('uninstalls cleanly, removing files and wiping namespaced storage', async () => {
    const pluginId = 'org.miyunadev.test.uninstall';
    await manager.install(createSamplePackage(pluginId));
    await manager.activate(pluginId);

    // Write some data to isolated storage
    await storage.setItem(pluginId, 'mySavedKey', 'sensitiveData');
    assert.equal(await storage.getItem(pluginId, 'mySavedKey'), 'sensitiveData');

    const installPath = join(tempBaseDir, pluginId);
    assert.equal(existsSync(installPath), true);

    // Uninstall
    const uninstalled = await manager.uninstall(pluginId);
    assert.equal(uninstalled, true);

    // Files wiped from disk
    assert.equal(existsSync(installPath), false);

    // Storage wiped
    assert.equal(await storage.getItem(pluginId, 'mySavedKey'), null);
    assert.equal((await storage.getKeys(pluginId)).length, 0);

    // Plugin unregistered
    assert.equal(manager.getPlugin(pluginId), undefined);
  });
});
