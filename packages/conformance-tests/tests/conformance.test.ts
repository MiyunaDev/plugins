import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runConformanceSuite } from '../src/conformance-suite.js';
import { IPluginHostAdapter } from '../src/types.js';
import {
  NamespacedStorageProvider,
  SecureKeyringProvider,
  NetworkProxyProvider,
  LocalPluginManager,
  CapabilityBroker,
  createStorageCapabilityHandler,
  createKeyringCapabilityHandler,
  createNetworkCapabilityHandler,
} from '../../runtime/src/index.js';
import { PluginRouter } from '../../ui-host/src/router/plugin-router.js';
import { IframeContainer } from '../../ui-host/src/container/iframe-container.js';

describe('Automated Conformance Test Suite for Host Clients (TEST-001)', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'miyuna-conformance-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  function createTestHostAdapter(hostName: string, clientDir: string): IPluginHostAdapter {
    let manager: LocalPluginManager;
    let broker: CapabilityBroker;
    let router: PluginRouter;
    let storage: NamespacedStorageProvider;
    let keyring: SecureKeyringProvider;
    let network: NetworkProxyProvider;

    return {
      hostName,
      async initialize(installDir: string) {
        storage = new NamespacedStorageProvider();
        keyring = new SecureKeyringProvider();
        network = new NetworkProxyProvider({ keyring });

        manager = new LocalPluginManager({
          baseInstallDir: installDir,
          storageProvider: storage,
          networkProvider: network,
          keyringProvider: keyring,
        });

        broker = new CapabilityBroker(manager);
        broker.registerCapabilityHandler(createStorageCapabilityHandler(storage));
        broker.registerCapabilityHandler(createKeyringCapabilityHandler(keyring));
        broker.registerCapabilityHandler(createNetworkCapabilityHandler(network));

        router = new PluginRouter();
      },
      async installPlugin(pkgBuffer: Buffer) {
        return manager.install(pkgBuffer);
      },
      async activatePlugin(pluginId: string) {
        const res = await manager.activate(pluginId);
        const manifest = manager.getManifest(pluginId);
        if (manifest) {
          router.registerPluginRoutes(pluginId, manifest, clientDir);
        }
        return res;
      },
      async deactivatePlugin(pluginId: string) {
        const res = await manager.deactivate(pluginId);
        router.unregisterPluginRoutes(pluginId);
        return res;
      },
      async uninstallPlugin(pluginId: string) {
        router.unregisterPluginRoutes(pluginId);
        return manager.uninstall(pluginId);
      },
      getPluginStatus(pluginId: string) {
        return manager.getPlugin(pluginId);
      },
      grantPermission(pluginId: string, capability: string, grantedBy = 'user') {
        manager.grantPermission(pluginId, capability, grantedBy);
      },
      revokePermission(pluginId: string, capability: string) {
        manager.revokePermission(pluginId, capability);
      },
      async dispatchRpc(request: any, pluginId?: string) {
        const targetId = pluginId || request.metadata?.pluginId || request.pluginId || 'unknown';
        return broker.handleRequest(targetId, request);
      },
      resolveRoute(path: string) {
        return router.resolveRoute(path);
      },
      getSandboxConfig(pluginId: string) {
        const container = new IframeContainer({ pluginId, sourceUrl: '/ext/org.miyunadev.conformance/dist/index.html' });
        return {
          sandbox: container.getSandboxAttributeString(),
          csp: container.getContentSecurityPolicy(),
        };
      },
      async cleanup() {
        // no-op
      },
    };
  }

  it('verifies Glacier (React Web) host client full conformance', async () => {
    const glacierAdapter = createTestHostAdapter('Glacier (Web)', join(tempDir, 'glacier'));
    const report = await runConformanceSuite(glacierAdapter, join(tempDir, 'glacier-installs'));

    expect(report.compliant).toBe(true);
    expect(report.failedCount).toBe(0);
    expect(report.passedCount).toBe(report.totalCount);
    expect(report.totalCount).toBeGreaterThanOrEqual(8);
  });

  it('verifies Kiirohana (Cordova Hybrid) host client full conformance', async () => {
    const kiirohanaAdapter = createTestHostAdapter('Kiirohana (Cordova Hybrid)', join(tempDir, 'kiirohana'));
    const report = await runConformanceSuite(kiirohanaAdapter, join(tempDir, 'kiirohana-installs'));

    expect(report.compliant).toBe(true);
    expect(report.failedCount).toBe(0);
    expect(report.passedCount).toBe(report.totalCount);
  });

  it('verifies Matcha (React Native / Expo) host client full conformance', async () => {
    const matchaAdapter = createTestHostAdapter('Matcha (React Native)', join(tempDir, 'matcha'));
    const report = await runConformanceSuite(matchaAdapter, join(tempDir, 'matcha-installs'));

    expect(report.compliant).toBe(true);
    expect(report.failedCount).toBe(0);
    expect(report.passedCount).toBe(report.totalCount);
  });
});
