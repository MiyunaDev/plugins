import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { GlacierPluginHost } from '../src/glacier/GlacierPluginHost.js';
import { KiirohanaPluginHost } from '../src/kiirohana/KiirohanaPluginHost.js';
import { MatchaPluginHost } from '../src/matcha/MatchaPluginHost.js';
import { createPackageBuffer } from '../../runtime/src/installer/packer.js';

describe('Official Reference Host Adapters (@miyuna/plugin-adapters)', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'miyuna-adapters-test-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  function createTestPlugin(): Buffer {
    return createPackageBuffer([
      {
        path: 'plugin.json',
        content: JSON.stringify({
          id: 'org.miyunadev.adaptertest',
          name: 'Adapter Test Plugin',
          version: '1.0.0',
          engines: { miyuna: '>=1.0.0' },
          artifact: { type: 'web-bundle', entry: 'dist/index.html' },
          contributions: [
            { type: 'route', id: 'main', title: 'Main', path: '/main' },
          ],
        }),
      },
      { path: 'dist/index.html', content: '<h1>test</h1>' },
    ]);
  }

  it('initializes Glacier Web host adapter and manages plugin lifecycle', async () => {
    const glacier = new GlacierPluginHost({ baseInstallDir: join(tempDir, 'glacier') });
    const pkg = createTestPlugin();

    const installed = await glacier.manager.install(pkg);
    expect(installed.pluginId).toBe('org.miyunadev.adaptertest');

    await glacier.activatePlugin('org.miyunadev.adaptertest');
    expect(glacier.manager.getPlugin('org.miyunadev.adaptertest')?.state).toBe('ACTIVE');

    const route = glacier.router.resolveRoute('/ext/org.miyunadev.adaptertest/main');
    expect(route?.contributionId).toBe('main');

    await glacier.deactivatePlugin('org.miyunadev.adaptertest');
    expect(glacier.manager.getPlugin('org.miyunadev.adaptertest')?.state).toBe('INACTIVE');
  });

  it('initializes Kiirohana Cordova host adapter and enforces security settings', async () => {
    const kiirohana = new KiirohanaPluginHost({ baseInstallDir: join(tempDir, 'kiirohana') });
    expect(kiirohana.securitySettings.allowFileAccess).toBe(false);
    expect(kiirohana.securitySettings.allowUniversalAccessFromFileURLs).toBe(false);

    const pkg = createTestPlugin();
    await kiirohana.manager.install(pkg);
    await kiirohana.activatePlugin('org.miyunadev.adaptertest');
    expect(kiirohana.manager.getPlugin('org.miyunadev.adaptertest')?.state).toBe('ACTIVE');
  });

  it('initializes Matcha React Native host adapter and handles webview bridge RPC', async () => {
    const matcha = new MatchaPluginHost({ baseInstallDir: join(tempDir, 'matcha') });
    const pkg = createTestPlugin();
    await matcha.manager.install(pkg);
    await matcha.activatePlugin('org.miyunadev.adaptertest');

    const postedMessages: string[] = [];
    const mockWebView = {
      postMessage: (msg: string) => postedMessages.push(msg),
    };

    const rpcReq = JSON.stringify({
      jsonrpc: '2.0',
      id: 'm-1',
      method: 'broker.getCapabilities',
      params: {},
    });

    await matcha.handleWebViewMessage('org.miyunadev.adaptertest', rpcReq, mockWebView);
    expect(postedMessages).toHaveLength(1);

    const res = JSON.parse(postedMessages[0]);
    expect(res.id).toBe('m-1');
    expect(res.result?.capabilities).toBeDefined();
  });
});
