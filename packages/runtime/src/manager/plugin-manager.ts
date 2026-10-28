/**
 * @file plugin-manager.ts
 * Local Plugin Manager handling installation, lifecycle state transitions, and permission grants.
 */

import { rmSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  PluginLifecycleState,
  isValidTransition,
  PluginRuntimeStatus,
} from '../../../contracts/src/lifecycle.js';
import { PluginManifest } from '../../../contracts/src/manifest.js';
import { PermissionGrant } from '../../../contracts/src/capabilities.js';
import { unpackPackage, UnpackResult, UnpackOptions } from '../installer/unpacker.js';
import { NamespacedStorageProvider } from '../providers/storage-provider.js';
import { NetworkProxyProvider } from '../providers/network-provider.js';
import { SecureKeyringProvider } from '../providers/credential-provider.js';
import { IPermissionChecker } from '../broker/broker.js';

export interface PluginRecord {
  manifest: PluginManifest;
  installDir: string;
  status: PluginRuntimeStatus;
  grants: Map<string, PermissionGrant>;
}

export interface PluginManagerOptions {
  baseInstallDir: string;
  storageProvider?: NamespacedStorageProvider;
  networkProvider?: NetworkProxyProvider;
  keyringProvider?: SecureKeyringProvider;
}

export class LocalPluginManager implements IPermissionChecker {
  private plugins = new Map<string, PluginRecord>();
  private baseInstallDir: string;
  private storageProvider?: NamespacedStorageProvider;
  private networkProvider?: NetworkProxyProvider;
  private keyringProvider?: SecureKeyringProvider;

  constructor(options: PluginManagerOptions) {
    this.baseInstallDir = resolve(options.baseInstallDir);
    this.storageProvider = options.storageProvider;
    this.networkProvider = options.networkProvider;
    this.keyringProvider = options.keyringProvider;
  }

  /**
   * Installs an .mpk package from a raw buffer into an isolated directory.
   */
  public async install(
    packageBuffer: Buffer,
    options?: UnpackOptions
  ): Promise<PluginRuntimeStatus> {
    // 1. Pre-extract into a temporary/deterministic target folder
    // Unpacker parses manifest first and validates Zip Slip
    const tempTarget = resolve(this.baseInstallDir, `temp-${Date.now()}`);
    let unpackResult: UnpackResult;

    try {
      unpackResult = unpackPackage(packageBuffer, tempTarget, options);
    } catch (err) {
      if (existsSync(tempTarget)) {
        rmSync(tempTarget, { recursive: true, force: true });
      }
      throw err;
    }

    const { manifest } = unpackResult;
    const finalInstallDir = resolve(this.baseInstallDir, manifest.id);

    // If destination already exists, clean up and replace
    if (existsSync(finalInstallDir)) {
      rmSync(finalInstallDir, { recursive: true, force: true });
    }

    // Move from temp to final directory (or unpack directly)
    const finalResult = unpackPackage(packageBuffer, finalInstallDir, options);
    rmSync(tempTarget, { recursive: true, force: true });

    // 2. Set storage quota & network domains if specified in manifest capabilities
    if (manifest.capabilities) {
      for (const cap of manifest.capabilities) {
        if (this.storageProvider && cap.name === 'storage.local' && cap.quota) {
          const match = cap.quota.match(/^(\d+)(KB|MB|GB)$/i);
          if (match) {
            const val = parseInt(match[1], 10);
            const unit = match[2].toUpperCase();
            const multiplier = unit === 'KB' ? 1024 : unit === 'MB' ? 1024 * 1024 : 1024 * 1024 * 1024;
            this.storageProvider.setPluginQuota(manifest.id, val * multiplier);
          }
        }
        if (this.networkProvider && cap.name === 'network.fetch' && cap.domains) {
          this.networkProvider.setAllowedDomains(manifest.id, cap.domains);
        }
      }
    }

    // 3. Register state in manager
    const now = Date.now();
    const status: PluginRuntimeStatus = {
      pluginId: manifest.id,
      state: PluginLifecycleState.INACTIVE,
      lastTransitionAt: now,
      installedVersion: manifest.version,
      enabled: false,
    };

    const existingRecord = this.plugins.get(manifest.id);
    const grants = existingRecord ? existingRecord.grants : new Map<string, PermissionGrant>();

    const record: PluginRecord = {
      manifest,
      installDir: finalInstallDir,
      status,
      grants,
    };

    this.plugins.set(manifest.id, record);

    return status;
  }

  /**
   * Activates an installed plugin.
   */
  public async activate(pluginId: string): Promise<PluginRuntimeStatus> {
    const record = this.plugins.get(pluginId);
    if (!record) {
      throw new Error(`Cannot activate non-existent plugin: '${pluginId}'`);
    }

    if (!isValidTransition(record.status.state, PluginLifecycleState.ACTIVATING)) {
      throw new Error(
        `Illegal state transition from '${record.status.state}' to '${PluginLifecycleState.ACTIVATING}'`
      );
    }

    // Transition: INACTIVE -> ACTIVATING -> ACTIVE
    record.status.state = PluginLifecycleState.ACTIVATING;
    record.status.lastTransitionAt = Date.now();

    // Perform initialization logic (hooks, checks)
    record.status.state = PluginLifecycleState.ACTIVE;
    record.status.enabled = true;
    record.status.lastTransitionAt = Date.now();

    return { ...record.status };
  }

  /**
   * Deactivates an active plugin.
   */
  public async deactivate(pluginId: string): Promise<PluginRuntimeStatus> {
    const record = this.plugins.get(pluginId);
    if (!record) {
      throw new Error(`Cannot deactivate non-existent plugin: '${pluginId}'`);
    }

    if (!isValidTransition(record.status.state, PluginLifecycleState.DEACTIVATING)) {
      throw new Error(
        `Illegal state transition from '${record.status.state}' to '${PluginLifecycleState.DEACTIVATING}'`
      );
    }

    // Transition: ACTIVE -> DEACTIVATING -> INACTIVE
    record.status.state = PluginLifecycleState.DEACTIVATING;
    record.status.lastTransitionAt = Date.now();

    record.status.state = PluginLifecycleState.INACTIVE;
    record.status.enabled = false;
    record.status.lastTransitionAt = Date.now();

    return { ...record.status };
  }

  /**
   * Uninstalls a plugin, removing files and clearing its namespaced storage.
   */
  public async uninstall(pluginId: string): Promise<boolean> {
    const record = this.plugins.get(pluginId);
    if (!record) return false;

    // If active, deactivate first
    if (record.status.state === PluginLifecycleState.ACTIVE) {
      await this.deactivate(pluginId);
    }

    record.status.state = PluginLifecycleState.UNINSTALLING;
    record.status.lastTransitionAt = Date.now();

    // 1. Remove files from disk
    if (existsSync(record.installDir)) {
      rmSync(record.installDir, { recursive: true, force: true });
    }

    // 2. Clear isolated storage & keyring
    if (this.storageProvider) {
      await this.storageProvider.clear(pluginId);
    }
    if (this.keyringProvider) {
      await this.keyringProvider.clear(pluginId);
    }

    // 3. Clear permissions and record
    record.grants.clear();
    record.status.state = PluginLifecycleState.UNINSTALLED;
    this.plugins.delete(pluginId);

    return true;
  }

  // Permission Management

  public grantPermission(
    pluginId: string,
    capability: string,
    constraints?: PermissionGrant['constraints']
  ): void {
    const record = this.plugins.get(pluginId);
    if (!record) {
      throw new Error(`Cannot grant permission to uninstalled plugin: '${pluginId}'`);
    }

    record.grants.set(capability, {
      pluginId,
      capability,
      grantedAt: Date.now(),
      grantedBy: 'user',
      status: 'granted',
      constraints,
    });
  }

  public revokePermission(pluginId: string, capability: string): void {
    const record = this.plugins.get(pluginId);
    if (record) {
      record.grants.delete(capability);
    }
  }

  public hasPermission(pluginId: string, capability: string): boolean {
    const record = this.plugins.get(pluginId);
    if (!record || !record.status.enabled) return false;
    const grant = record.grants.get(capability);
    return grant?.status === 'granted';
  }

  public getGrantedCapabilities(pluginId: string): string[] {
    const record = this.plugins.get(pluginId);
    if (!record) return [];
    const caps: string[] = [];
    for (const [cap, grant] of record.grants.entries()) {
      if (grant.status === 'granted') {
        caps.push(cap);
      }
    }
    return caps;
  }

  // Introspection

  public listInstalledPlugins(): PluginRuntimeStatus[] {
    return Array.from(this.plugins.values()).map((p) => ({ ...p.status }));
  }

  public getPlugin(pluginId: string): PluginRuntimeStatus | undefined {
    const record = this.plugins.get(pluginId);
    return record ? { ...record.status } : undefined;
  }

  public getManifest(pluginId: string): PluginManifest | undefined {
    return this.plugins.get(pluginId)?.manifest;
  }
}
