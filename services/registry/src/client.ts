/**
 * @file client.ts
 * Registry Client SDK for searching, inspecting, downloading, and publishing plugins.
 */

import { LocalPluginManager, PluginRuntimeStatus } from '../../../packages/runtime/src/manager/plugin-manager.js';
import { RegistrySearchFilters } from './storage/store.js';

export interface RegistryClientOptions {
  baseUrl: string;
  token?: string;
}

export interface DownloadResult {
  packageBuffer: Buffer;
  sha256?: string;
  signature?: string;
}

export class PluginRegistryClient {
  private baseUrl: string;
  private token?: string;

  constructor(options: RegistryClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.token = options.token;
  }

  public async getHealth(): Promise<{ status: string; version: string; uptime: number }> {
    const res = await fetch(`${this.baseUrl}/v1/health`);
    if (!res.ok) throw new Error(`Healthcheck failed with HTTP ${res.status}`);
    return res.json() as any;
  }

  public async search(filters: RegistrySearchFilters = {}): Promise<any> {
    const params = new URLSearchParams();
    if (filters.query) params.set('query', filters.query);
    if (filters.category) params.set('category', filters.category);
    if (filters.tag) params.set('tag', filters.tag);
    if (filters.client_engine) params.set('client_engine', filters.client_engine);
    if (filters.client_version) params.set('client_version', filters.client_version);
    if (filters.miyuna_version) params.set('miyuna_version', filters.miyuna_version);
    if (filters.page) params.set('page', filters.page.toString());
    if (filters.limit) params.set('limit', filters.limit.toString());

    const url = `${this.baseUrl}/v1/plugins?${params.toString()}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to search plugins: HTTP ${res.status}`);
    return res.json();
  }

  public async getPlugin(id: string, clientEngine?: string, clientVersion?: string): Promise<any> {
    const params = new URLSearchParams();
    if (clientEngine) params.set('client_engine', clientEngine);
    if (clientVersion) params.set('client_version', clientVersion);

    const qs = params.toString();
    const url = `${this.baseUrl}/v1/plugins/${encodeURIComponent(id)}${qs ? `?${qs}` : ''}`;
    const res = await fetch(url);
    if (!res.ok) {
      if (res.status === 404) return null;
      throw new Error(`Failed to get plugin '${id}': HTTP ${res.status}`);
    }
    return res.json();
  }

  public async getPluginVersion(id: string, version: string): Promise<any> {
    const url = `${this.baseUrl}/v1/plugins/${encodeURIComponent(id)}/versions/${encodeURIComponent(version)}`;
    const res = await fetch(url);
    if (!res.ok) {
      if (res.status === 404) return null;
      throw new Error(`Failed to get version '${version}' for plugin '${id}': HTTP ${res.status}`);
    }
    return res.json();
  }

  public async downloadPackage(id: string, version: string): Promise<DownloadResult> {
    const url = `${this.baseUrl}/v1/plugins/${encodeURIComponent(id)}/versions/${encodeURIComponent(version)}/download`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Failed to download plugin package '${id}@${version}': HTTP ${res.status}`);
    }

    const arrayBuf = await res.arrayBuffer();
    const packageBuffer = Buffer.from(arrayBuf);
    const sha256 = res.headers.get('x-package-sha256') || undefined;
    const signature = res.headers.get('x-package-signature') || undefined;

    return {
      packageBuffer,
      sha256,
      signature,
    };
  }

  public async publishPackage(
    packageBuffer: Buffer,
    options: { signature?: string; publicKey?: string } = {}
  ): Promise<any> {
    const url = `${this.baseUrl}/v1/plugins/publish`;
    const payload = {
      packageBase64: packageBuffer.toString('base64'),
      signature: options.signature,
      publicKey: options.publicKey,
    };

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    const body = await res.json() as any;
    if (!res.ok) {
      throw new Error(`Publish failed (${res.status}): ${body.message || body.error}`);
    }

    return body;
  }

  /**
   * High-level helper: downloads package from registry, validates signature (optional),
   * and installs it directly into the local client plugin manager.
   */
  public async installFromRegistry(
    pluginManager: LocalPluginManager,
    id: string,
    version?: string,
    options: {
      publicKey?: string | Buffer;
      verifySignature?: boolean;
      clientEngine?: string;
      clientVersion?: string;
    } = {}
  ): Promise<PluginRuntimeStatus> {
    let targetVersion = version;

    // If version not specified, resolve latest compatible version
    if (!targetVersion) {
      const plugin = await this.getPlugin(id, options.clientEngine, options.clientVersion);
      if (!plugin) {
        throw new Error(`Plugin '${id}' was not found in registry`);
      }
      targetVersion = plugin.latestCompatibleVersion || plugin.latestVersion;
      if (!targetVersion) {
        throw new Error(`No compatible version found in registry for plugin '${id}'`);
      }
    }

    const { packageBuffer } = await this.downloadPackage(id, targetVersion);

    return pluginManager.install(packageBuffer, {
      publicKey: options.publicKey,
      requireSignature: options.verifySignature,
    });
  }
}
