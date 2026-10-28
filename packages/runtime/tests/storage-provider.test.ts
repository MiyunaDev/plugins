import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { NamespacedStorageProvider, QuotaExceededError } from '../src/providers/storage-provider.js';

describe('Namespaced Storage Provider & Quota Enforcement', () => {
  test('supports basic key-value operations', async () => {
    const storage = new NamespacedStorageProvider();
    const pluginId = 'org.miyunadev.test.app';

    await storage.setItem(pluginId, 'theme', 'dark');
    await storage.setItem(pluginId, 'count', 42);

    assert.equal(await storage.getItem(pluginId, 'theme'), 'dark');
    assert.equal(await storage.getItem(pluginId, 'count'), 42);

    const keys = await storage.getKeys(pluginId);
    assert.deepEqual(keys.sort(), ['count', 'theme']);

    await storage.removeItem(pluginId, 'theme');
    assert.equal(await storage.getItem(pluginId, 'theme'), null);
  });

  test('strictly isolates storage between different plugins', async () => {
    const storage = new NamespacedStorageProvider();
    const pluginA = 'org.miyunadev.plugin.a';
    const pluginB = 'org.miyunadev.plugin.b';

    await storage.setItem(pluginA, 'sharedKey', 'ValueA');
    await storage.setItem(pluginB, 'sharedKey', 'ValueB');

    assert.equal(await storage.getItem(pluginA, 'sharedKey'), 'ValueA');
    assert.equal(await storage.getItem(pluginB, 'sharedKey'), 'ValueB');

    // Clearing plugin A does not touch plugin B
    await storage.clear(pluginA);
    assert.equal(await storage.getItem(pluginA, 'sharedKey'), null);
    assert.equal(await storage.getItem(pluginB, 'sharedKey'), 'ValueB');
  });

  test('enforces quota limits and throws QuotaExceededError', async () => {
    const storage = new NamespacedStorageProvider();
    const pluginId = 'org.miyunadev.plugin.limited';

    // Set tight quota of 100 bytes
    storage.setPluginQuota(pluginId, 100);

    // Write small payload: ~30 bytes
    await storage.setItem(pluginId, 'k1', 'small-val');

    // Attempt to write payload exceeding 100 bytes
    const hugePayload = 'A'.repeat(200);

    await assert.rejects(
      async () => {
        await storage.setItem(pluginId, 'k2', hugePayload);
      },
      (err: any) => err instanceof QuotaExceededError && err.code === -32002
    );
  });

  test('tracks byte usage and remaining quota accurately', async () => {
    const storage = new NamespacedStorageProvider();
    const pluginId = 'org.miyunadev.plugin.usage';
    storage.setPluginQuota(pluginId, 1024);

    const res = await storage.setItem(pluginId, 'greeting', 'hello');
    assert.equal(res.success, true);
    assert.ok(res.bytesUsed > 0);
    assert.equal(res.remainingBytes, 1024 - res.bytesUsed);

    const usage = await storage.getUsage(pluginId);
    assert.equal(usage.bytesUsed, res.bytesUsed);
    assert.equal(usage.keyCount, 1);
  });
});
