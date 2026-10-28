/**
 * @file index.ts
 * Main entry point for @miyuna/plugin-bridge.
 */

import { MiyunaBridge } from './bridge.js';
import { StorageClient } from './storage.js';
import { NetworkClient } from './network.js';
import { KeyringClient } from './keyring.js';
import { SyncClient } from './sync.js';

export * from './bridge.js';
export * from './storage.js';
export * from './network.js';
export * from './keyring.js';
export * from './sync.js';

export class MiyunaPluginSDK {
  public readonly bridge: MiyunaBridge;
  public readonly storage: StorageClient;
  public readonly network: NetworkClient;
  public readonly keyring: KeyringClient;
  public readonly sync: SyncClient;

  constructor(bridge?: MiyunaBridge) {
    this.bridge = bridge ?? new MiyunaBridge();
    this.storage = new StorageClient(this.bridge);
    this.network = new NetworkClient(this.bridge);
    this.keyring = new KeyringClient(this.bridge);
    this.sync = new SyncClient(this.bridge);
  }
}

// Global default instance for browser scripts
export const miyuna = new MiyunaPluginSDK();

if (typeof window !== 'undefined') {
  (window as any).miyuna = miyuna;
}
