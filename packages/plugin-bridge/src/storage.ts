/**
 * @file storage.ts
 * Typed helper client for the storage.local capability.
 */

import { MiyunaBridge } from './bridge.js';

export interface StorageUsage {
  bytesUsed: number;
  quotaBytes: number;
  remainingBytes: number;
  keyCount: number;
}

export class StorageClient {
  constructor(private bridge: MiyunaBridge) {}

  async getItem<T = unknown>(key: string): Promise<T | null> {
    return this.bridge.invoke('storage.local', 'getItem', { key });
  }

  async setItem(
    key: string,
    value: unknown
  ): Promise<{ success: boolean; bytesUsed: number; remainingBytes: number }> {
    return this.bridge.invoke('storage.local', 'setItem', { key, value });
  }

  async removeItem(key: string): Promise<boolean> {
    return this.bridge.invoke('storage.local', 'removeItem', { key });
  }

  async clear(): Promise<void> {
    return this.bridge.invoke('storage.local', 'clear');
  }

  async getKeys(): Promise<string[]> {
    return this.bridge.invoke('storage.local', 'getKeys');
  }

  async getUsage(): Promise<StorageUsage> {
    return this.bridge.invoke('storage.local', 'getUsage');
  }
}
