/**
 * @file KiirohanaPluginHost.ts
 * Kiirohana (Apache Cordova Hybrid Mobile) Host Adapter for Miyuna Universal Plugins.
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

export interface CordovaSecuritySettings {
  allowFileAccess: boolean;
  allowContentAccess: boolean;
  allowUniversalAccessFromFileURLs: boolean;
}

export interface KiirohanaPluginHostOptions {
  baseInstallDir?: string;
}

export class KiirohanaPluginHost {
  private static instance: KiirohanaPluginHost;

  public readonly storage: NamespacedStorageProvider;
  public readonly keyring: SecureKeyringProvider;
  public readonly network: NetworkProxyProvider;
  public readonly manager: LocalPluginManager;
  public readonly broker: CapabilityBroker;
  public readonly router: PluginRouter;
  public readonly baseInstallDir: string;

  // Strict Android WebView security configurations enforced by Cordova host
  public readonly securitySettings: CordovaSecuritySettings = {
    allowFileAccess: false,
    allowContentAccess: false,
    allowUniversalAccessFromFileURLs: false,
  };

  constructor(options: KiirohanaPluginHostOptions = {}) {
    this.baseInstallDir = options.baseInstallDir || './kiirohana-plugins';
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

  public static getInstance(): KiirohanaPluginHost {
    if (!KiirohanaPluginHost.instance) {
      KiirohanaPluginHost.instance = new KiirohanaPluginHost();
    }
    return KiirohanaPluginHost.instance;
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
