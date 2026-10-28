/**
 * @file MatchaPluginHost.ts
 * Matcha (React Native / Expo Mobile) Host Adapter for Miyuna Universal Plugins.
 */

import {
  LocalPluginManager,
  NamespacedStorageProvider,
  SecureKeyringProvider,
  NetworkProxyProvider,
  CapabilityBroker,
  createStorageCapabilityHandler,
  createKeyringCapabilityHandler,
  createNetworkCapabilityHandler,
} from '../../../runtime/src/index.js';
import { PluginRouter } from '../../../ui-host/src/router/plugin-router.js';

export interface ReactNativeWebViewRef {
  postMessage(messageStr: string): void;
}

export interface MatchaPluginHostOptions {
  baseInstallDir?: string;
}

export class MatchaPluginHost {
  private static instance: MatchaPluginHost;

  public readonly storage: NamespacedStorageProvider;
  public readonly keyring: SecureKeyringProvider;
  public readonly network: NetworkProxyProvider;
  public readonly manager: LocalPluginManager;
  public readonly broker: CapabilityBroker;
  public readonly router: PluginRouter;
  public readonly baseInstallDir: string;

  constructor(options: MatchaPluginHostOptions = {}) {
    this.baseInstallDir = options.baseInstallDir || './matcha-plugins';
    this.storage = new NamespacedStorageProvider();
    this.keyring = new SecureKeyringProvider();
    this.network = new NetworkProxyProvider({ keyring: this.keyring });

    this.manager = new LocalPluginManager({
      baseInstallDir: this.baseInstallDir,
      storageProvider: this.storage,
      networkProvider: this.network,
      keyringProvider: this.keyring,
    });

    this.broker = new CapabilityBroker(this.manager);
    this.broker.registerCapabilityHandler(createStorageCapabilityHandler(this.storage));
    this.broker.registerCapabilityHandler(createKeyringCapabilityHandler(this.keyring));
    this.broker.registerCapabilityHandler(createNetworkCapabilityHandler(this.network));

    this.router = new PluginRouter();
  }

  public static getInstance(): MatchaPluginHost {
    if (!MatchaPluginHost.instance) {
      MatchaPluginHost.instance = new MatchaPluginHost();
    }
    return MatchaPluginHost.instance;
  }

  /**
   * Dispatches incoming message from react-native-webview onMessage handler.
   */
  public async handleWebViewMessage(
    pluginId: string,
    rawMessage: string,
    webViewRef: ReactNativeWebViewRef
  ): Promise<void> {
    let parsed: any;
    try {
      parsed = JSON.parse(rawMessage);
    } catch {
      webViewRef.postMessage(
        JSON.stringify({
          jsonrpc: '2.0',
          id: null,
          error: { code: -32700, message: 'Parse error: invalid JSON' },
        })
      );
      return;
    }

    const response = await this.broker.handleRequest(pluginId, parsed);
    webViewRef.postMessage(JSON.stringify(response));
  }

  public async activatePlugin(pluginId: string): Promise<void> {
    await this.manager.activate(pluginId);
    const manifest = this.manager.getManifest(pluginId);
    if (manifest) {
      this.router.registerPluginRoutes(pluginId, manifest, this.baseInstallDir);
    }
  }

  public async deactivatePlugin(pluginId: string): Promise<void> {
    await this.manager.deactivate(pluginId);
    this.router.unregisterPluginRoutes(pluginId);
  }
}
