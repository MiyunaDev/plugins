/**
 * @file GlacierPluginHost.ts
 * Glacier (React/Vite Web) Host Adapter for Miyuna Universal Plugins.
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

export interface GlacierPluginHostOptions {
  baseInstallDir?: string;
}

export class GlacierPluginHost {
  private static instance: GlacierPluginHost;

  public readonly storage: NamespacedStorageProvider;
  public readonly keyring: SecureKeyringProvider;
  public readonly network: NetworkProxyProvider;
  public readonly manager: LocalPluginManager;
  public readonly broker: CapabilityBroker;
  public readonly router: PluginRouter;
  public readonly baseInstallDir: string;

  constructor(options: GlacierPluginHostOptions = {}) {
    this.baseInstallDir = options.baseInstallDir || './glacier-plugins';
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

  public static getInstance(): GlacierPluginHost {
    if (!GlacierPluginHost.instance) {
      GlacierPluginHost.instance = new GlacierPluginHost();
    }
    return GlacierPluginHost.instance;
  }

  /**
   * Activates a plugin and registers its route contributions.
   */
  public async activatePlugin(pluginId: string): Promise<void> {
    await this.manager.activate(pluginId);
    const manifest = this.manager.getManifest(pluginId);
    if (manifest) {
      this.router.registerPluginRoutes(pluginId, manifest, this.baseInstallDir);
    }
  }

  /**
   * Deactivates a plugin and unregisters its routes.
   */
  public async deactivatePlugin(pluginId: string): Promise<void> {
    await this.manager.deactivate(pluginId);
    this.router.unregisterPluginRoutes(pluginId);
  }
}
