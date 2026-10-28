/**
 * @file storage-provider.ts
 * Namespaced, quota-enforced isolated storage provider for Miyuna plugins.
 */

import { StorageUsageResult } from '../../../contracts/src/capabilities.js';
import { BrokerErrorCode } from '../../../contracts/src/rpc.js';

export class QuotaExceededError extends Error {
  public readonly code = BrokerErrorCode.QUOTA_EXCEEDED;
  constructor(message: string) {
    super(message);
    this.name = 'QuotaExceededError';
  }
}

export interface IStorageBackend {
  get(namespacedKey: string): Promise<string | null>;
  set(namespacedKey: string, value: string): Promise<void>;
  delete(namespacedKey: string): Promise<boolean>;
  listKeys(prefix: string): Promise<string[]>;
}

/**
 * In-memory storage backend for runtime testing and default headless mode.
 */
export class MemoryStorageBackend implements IStorageBackend {
  private store = new Map<string, string>();

  async get(key: string): Promise<string | null> {
    return this.store.get(key) ?? null;
  }

  async set(key: string, value: string): Promise<void> {
    this.store.set(key, value);
  }

  async delete(key: string): Promise<boolean> {
    return this.store.delete(key);
  }

  async listKeys(prefix: string): Promise<string[]> {
    const keys: string[] = [];
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) {
        keys.push(key);
      }
    }
    return keys;
  }
}

export class NamespacedStorageProvider {
  private quotas = new Map<string, number>(); // pluginId -> max quota in bytes
  private defaultQuotaBytes: number;

  constructor(
    private backend: IStorageBackend = new MemoryStorageBackend(),
    defaultQuotaBytes: number = 10 * 1024 * 1024 // 10MB default
  ) {
    this.defaultQuotaBytes = defaultQuotaBytes;
  }

  public setPluginQuota(pluginId: string, quotaBytes: number): void {
    this.quotas.set(pluginId, quotaBytes);
  }

  public getPluginQuota(pluginId: string): number {
    return this.quotas.get(pluginId) ?? this.defaultQuotaBytes;
  }

  private makePrefix(pluginId: string): string {
    return `plugin:${pluginId}:`;
  }

  private makeKey(pluginId: string, key: string): string {
    return `${this.makePrefix(pluginId)}${key}`;
  }

  async getItem<T = unknown>(pluginId: string, key: string): Promise<T | null> {
    const raw = await this.backend.get(this.makeKey(pluginId, key));
    if (raw === null) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return raw as unknown as T;
    }
  }

  async setItem(
    pluginId: string,
    key: string,
    value: unknown
  ): Promise<{ success: boolean; bytesUsed: number; remainingBytes: number }> {
    const serialized = JSON.stringify(value);
    const itemBytes = Buffer.byteLength(key, 'utf-8') + Buffer.byteLength(serialized, 'utf-8');

    const usage = await this.getUsage(pluginId);
    const existingRaw = await this.backend.get(this.makeKey(pluginId, key));
    const existingBytes =
      existingRaw !== null
        ? Buffer.byteLength(key, 'utf-8') + Buffer.byteLength(existingRaw, 'utf-8')
        : 0;

    const projectedBytes = usage.bytesUsed - existingBytes + itemBytes;
    const quota = this.getPluginQuota(pluginId);

    if (projectedBytes > quota) {
      throw new QuotaExceededError(
        `Storage quota exceeded for plugin '${pluginId}'. Quota: ${quota} bytes, Required: ${projectedBytes} bytes`
      );
    }

    await this.backend.set(this.makeKey(pluginId, key), serialized);

    return {
      success: true,
      bytesUsed: projectedBytes,
      remainingBytes: Math.max(0, quota - projectedBytes),
    };
  }

  async removeItem(pluginId: string, key: string): Promise<boolean> {
    return this.backend.delete(this.makeKey(pluginId, key));
  }

  async clear(pluginId: string): Promise<void> {
    const keys = await this.backend.listKeys(this.makePrefix(pluginId));
    for (const k of keys) {
      await this.backend.delete(k);
    }
  }

  async getKeys(pluginId: string): Promise<string[]> {
    const prefix = this.makePrefix(pluginId);
    const fullKeys = await this.backend.listKeys(prefix);
    return fullKeys.map((k) => k.slice(prefix.length));
  }

  async getUsage(pluginId: string): Promise<StorageUsageResult> {
    const prefix = this.makePrefix(pluginId);
    const keys = await this.backend.listKeys(prefix);
    let bytes = 0;

    for (const fullKey of keys) {
      const shortKey = fullKey.slice(prefix.length);
      const val = await this.backend.get(fullKey);
      bytes += Buffer.byteLength(shortKey, 'utf-8');
      if (val !== null) {
        bytes += Buffer.byteLength(val, 'utf-8');
      }
    }

    const quota = this.getPluginQuota(pluginId);

    return {
      bytesUsed: bytes,
      quotaBytes: quota,
      remainingBytes: Math.max(0, quota - bytes),
      keyCount: keys.length,
    };
  }
}
