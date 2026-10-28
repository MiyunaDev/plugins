import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

import { createPackageBuffer } from '../../runtime/src/installer/packer.js';
import { LocalPluginManager } from '../../runtime/src/manager/plugin-manager.js';
import { NamespacedStorageProvider } from '../../runtime/src/providers/storage-provider.js';
import { CapabilityBroker, createStorageCapabilityHandler } from '../../runtime/src/broker/broker.js';
import { PluginRouter } from '../src/router/plugin-router.js';
import { createRpcRequest } from '../../contracts/src/rpc.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const miniGameDir = resolve(__dirname, '../../../examples/mini-game-demo');

describe('Demonstration Mini-Game (.mpk) Integration Test', () => {
  let tempBaseDir: string;
  let storage: NamespacedStorageProvider;
  let manager: LocalPluginManager;
  let broker: CapabilityBroker;
  let router: PluginRouter;

  beforeEach(() => {
    tempBaseDir = mkdtempSync(join(tmpdir(), 'miyuna-game-test-'));
    storage = new NamespacedStorageProvider();
    manager = new LocalPluginManager({
      baseInstallDir: tempBaseDir,
      storageProvider: storage,
    });
    broker = new CapabilityBroker(manager);
    broker.registerCapabilityHandler(createStorageCapabilityHandler(storage));
    router = new PluginRouter();
  });

  afterEach(() => {
    if (existsSync(tempBaseDir)) {
      rmSync(tempBaseDir, { recursive: true, force: true });
    }
  });

  test('packages mini-game into valid .mpk and completes full install/activate/route/persist lifecycle', async () => {
    // 1. Read files from examples/mini-game-demo
    const manifestContent = readFileSync(join(miniGameDir, 'plugin.json'), 'utf-8');
    const indexHtml = readFileSync(join(miniGameDir, 'dist', 'index.html'), 'utf-8');
    const gameJs = readFileSync(join(miniGameDir, 'dist', 'game.js'), 'utf-8');
    const styleCss = readFileSync(join(miniGameDir, 'dist', 'style.css'), 'utf-8');
    const iconPng = readFileSync(join(miniGameDir, 'assets', 'icon.png'));

    // 2. Package into .mpk archive
    const mpkBuffer = createPackageBuffer([
      { path: 'plugin.json', content: manifestContent },
      { path: 'dist/index.html', content: indexHtml },
      { path: 'dist/game.js', content: gameJs },
      { path: 'dist/style.css', content: styleCss },
      { path: 'assets/icon.png', content: iconPng },
    ]);

    assert.ok(mpkBuffer.length > 500, 'Packaged .mpk buffer must be non-empty');

    // 3. Install into LocalPluginManager
    const installStatus = await manager.install(mpkBuffer);
    assert.equal(installStatus.pluginId, 'org.miyunadev.games.retro-arcade');
    assert.equal(installStatus.installedVersion, '1.0.0');

    // 4. Grant requested 'storage.local' capability & activate
    manager.grantPermission('org.miyunadev.games.retro-arcade', 'storage.local');
    const activeStatus = await manager.activate('org.miyunadev.games.retro-arcade');
    assert.equal(activeStatus.enabled, true);

    // 5. Register routes in UI PluginRouter
    const manifest = manager.getManifest('org.miyunadev.games.retro-arcade')!;
    const routes = router.registerPluginRoutes('org.miyunadev.games.retro-arcade', manifest, tempBaseDir);

    assert.equal(routes.length, 1);
    assert.equal(routes[0].fullPath, '/ext/org.miyunadev.games.retro-arcade/snake');

    // 6. Resolve route
    const resolved = router.resolveRoute('/ext/org.miyunadev.games.retro-arcade/snake');
    assert.ok(resolved !== undefined);
    assert.equal(resolved.title, 'Retro Snake Arcade');
    assert.equal(resolved.entryPoint, 'dist/index.html');

    // 7. Verify Mini-Game can persist high score through broker RPC
    const saveReq = createRpcRequest('req-game-1', 'broker.invoke', {
      capability: 'storage.local',
      action: 'setItem',
      args: { key: 'highScore', value: 240 },
    });
    const saveRes = await broker.handleRequest('org.miyunadev.games.retro-arcade', saveReq);
    assert.ok('result' in saveRes);

    const getReq = createRpcRequest('req-game-2', 'broker.invoke', {
      capability: 'storage.local',
      action: 'getItem',
      args: { key: 'highScore' },
    });
    const getRes = await broker.handleRequest('org.miyunadev.games.retro-arcade', getReq);
    assert.ok('result' in getRes);
    assert.equal((getRes as any).result, 240);
  });
});
