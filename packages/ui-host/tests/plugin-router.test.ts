import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { PluginRouter } from '../src/router/plugin-router.js';
import { PluginManifest } from '../../../contracts/src/manifest.js';

describe('Plugin Router & Namespaced Navigation', () => {
  const sampleManifest: PluginManifest = {
    $schema: 'https://specs.miyunadev.org/schemas/v1/plugin.schema.json',
    id: 'org.miyunadev.games.snake',
    name: 'Snake Game',
    version: '1.0.0',
    engines: { miyuna: '>=1.0.0' },
    artifact: { type: 'web-bundle', entry: 'dist/index.html' },
    author: { name: 'Author' },
    contributions: [
      {
        type: 'route',
        id: 'snake-main',
        title: 'Play Snake',
        path: '/play',
      },
      {
        type: 'route',
        id: 'snake-scores',
        title: 'High Scores',
        path: '/scores',
      },
    ],
  };

  test('registers route contributions with /ext/:pluginId prefix', () => {
    const router = new PluginRouter();
    const registered = router.registerPluginRoutes(sampleManifest.id, sampleManifest, '/plugins');

    assert.equal(registered.length, 2);
    assert.equal(registered[0].fullPath, '/ext/org.miyunadev.games.snake/play');
    assert.equal(registered[1].fullPath, '/ext/org.miyunadev.games.snake/scores');
  });

  test('resolves active routes accurately', () => {
    const router = new PluginRouter();
    router.registerPluginRoutes(sampleManifest.id, sampleManifest, '/plugins');

    const matchPlay = router.resolveRoute('/ext/org.miyunadev.games.snake/play');
    assert.ok(matchPlay !== undefined);
    assert.equal(matchPlay.title, 'Play Snake');
    assert.equal(matchPlay.entryPoint, 'dist/index.html');

    const matchUnknown = router.resolveRoute('/ext/org.miyunadev.games.snake/nonexistent');
    assert.equal(matchUnknown, undefined);
  });

  test('prevents route collisions from duplicate registrations', () => {
    const router = new PluginRouter();
    router.registerPluginRoutes(sampleManifest.id, sampleManifest, '/plugins');

    assert.throws(
      () => router.registerPluginRoutes(sampleManifest.id, sampleManifest, '/plugins'),
      (err: any) => err.message.includes('Route collision detected')
    );
  });

  test('unregisters routes cleanly upon plugin deactivation or removal', () => {
    const router = new PluginRouter();
    router.registerPluginRoutes(sampleManifest.id, sampleManifest, '/plugins');

    assert.equal(router.listActiveRoutes().length, 2);

    // Deactivate routes
    router.setPluginRoutesActive(sampleManifest.id, false);
    assert.equal(router.resolveRoute('/ext/org.miyunadev.games.snake/play'), undefined);
    assert.equal(router.listActiveRoutes().length, 0);

    // Unregister
    const removedCount = router.unregisterPluginRoutes(sampleManifest.id);
    assert.equal(removedCount, 2);
    assert.equal(router.resolveRoute('/ext/org.miyunadev.games.snake/play'), undefined);
  });
});
