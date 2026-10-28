/**
 * @file store.ts
 * Storage provider for plugin metadata and .mpk package archives.
 */

import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { PluginManifest } from '../../../../packages/contracts/src/manifest.js';
import { compareSemver, isEngineCompatible } from '../engine/semver.js';

export interface StoredVersion {
  version: string;
  manifest: PluginManifest;
  sha256: string;
  signature?: string;
  publisherKey?: string;
  publishedAt: string;
  downloadCount: number;
  packageBuffer: Buffer;
}

export interface StoredPlugin {
  id: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
  author: { name: string; email?: string; url?: string };
  repository?: string;
  verifiedPublisher: boolean;
  downloads: number;
  createdAt: string;
  updatedAt: string;
  versions: Map<string, StoredVersion>;
}

export interface RegistrySearchFilters {
  query?: string;
  category?: string;
  tag?: string;
  client_engine?: string;
  client_version?: string;
  miyuna_version?: string;
  page?: number;
  limit?: number;
}

export class RegistryStore {
  private plugins = new Map<string, StoredPlugin>();
  private storageDir?: string;

  constructor(storageDir?: string) {
    if (storageDir) {
      this.storageDir = resolve(storageDir);
      if (!existsSync(this.storageDir)) {
        mkdirSync(this.storageDir, { recursive: true });
      }
    }
  }

  /**
   * Registers or updates a plugin version with its .mpk package buffer.
   */
  public saveVersion(
    manifest: PluginManifest,
    packageBuffer: Buffer,
    signature?: string,
    publisherKey?: string
  ): StoredVersion {
    const pluginId = manifest.id;
    const versionStr = manifest.version;
    const sha256 = createHash('sha256').update(packageBuffer).digest('hex');
    const now = new Date().toISOString();

    let plugin = this.plugins.get(pluginId);
    if (!plugin) {
      // Deduce category from contributions
      let category = 'generic';
      if (manifest.contributions) {
        if (manifest.contributions.some((c) => c.id.includes('game') || c.title.toLowerCase().includes('game'))) {
          category = 'game';
        } else if (manifest.artifact.type === 'service-connector') {
          category = 'media';
        } else if (manifest.contributions.some((c) => c.type === 'capability-provider')) {
          category = 'sync';
        } else if (manifest.contributions.some((c) => c.type === 'route' || c.type === 'widget')) {
          category = 'tool';
        }
      }

      plugin = {
        id: pluginId,
        name: manifest.name,
        description: manifest.description || '',
        category,
        tags: [],
        author: manifest.author,
        repository: manifest.repository,
        verifiedPublisher: !!signature,
        downloads: 0,
        createdAt: now,
        updatedAt: now,
        versions: new Map(),
      };
      this.plugins.set(pluginId, plugin);
    } else {
      if (plugin.versions.has(versionStr)) {
        throw new Error(`Version '${versionStr}' already exists for plugin '${pluginId}' (releases are immutable)`);
      }
      plugin.updatedAt = now;
      plugin.name = manifest.name;
      if (manifest.description) plugin.description = manifest.description;
      if (manifest.repository) plugin.repository = manifest.repository;
      if (signature) plugin.verifiedPublisher = true;
    }

    const versionRecord: StoredVersion = {
      version: versionStr,
      manifest,
      sha256,
      signature,
      publisherKey,
      publishedAt: now,
      downloadCount: 0,
      packageBuffer,
    };

    plugin.versions.set(versionStr, versionRecord);

    // Save package archive to disk if storage directory is configured
    if (this.storageDir) {
      const pluginDir = join(this.storageDir, pluginId);
      if (!existsSync(pluginDir)) {
        mkdirSync(pluginDir, { recursive: true });
      }
      const mpkPath = join(pluginDir, `${pluginId}-${versionStr}.mpk`);
      writeFileSync(mpkPath, packageBuffer);
    }

    return versionRecord;
  }

  public getPlugin(id: string): StoredPlugin | undefined {
    return this.plugins.get(id);
  }

  public getVersion(id: string, version: string): StoredVersion | undefined {
    const plugin = this.plugins.get(id);
    if (!plugin) return undefined;
    return plugin.versions.get(version);
  }

  public incrementDownload(id: string, version: string): void {
    const plugin = this.plugins.get(id);
    if (!plugin) return;
    plugin.downloads++;
    const v = plugin.versions.get(version);
    if (v) v.downloadCount++;
  }

  public getSortedVersions(plugin: StoredPlugin): StoredVersion[] {
    return Array.from(plugin.versions.values()).sort((a, b) => compareSemver(b.version, a.version));
  }

  public getLatestVersion(plugin: StoredPlugin): StoredVersion | undefined {
    const sorted = this.getSortedVersions(plugin);
    return sorted[0];
  }

  public getLatestCompatibleVersion(
    plugin: StoredPlugin,
    clientEngine?: string,
    clientVersion?: string,
    miyunaVersion?: string
  ): StoredVersion | undefined {
    const sorted = this.getSortedVersions(plugin);
    for (const v of sorted) {
      if (isEngineCompatible(v.manifest.engines, clientEngine, clientVersion, miyunaVersion)) {
        return v;
      }
    }
    return undefined;
  }

  /**
   * Search plugins matching query and engine filters with pagination.
   */
  public search(filters: RegistrySearchFilters = {}) {
    const {
      query,
      category,
      tag,
      client_engine,
      client_version,
      miyuna_version,
      page = 1,
      limit = 20,
    } = filters;

    let results = Array.from(this.plugins.values());

    // 1. Text Query Filter
    if (query) {
      const q = query.toLowerCase();
      results = results.filter(
        (p) =>
          p.id.toLowerCase().includes(q) ||
          p.name.toLowerCase().includes(q) ||
          p.description.toLowerCase().includes(q) ||
          p.tags.some((t) => t.toLowerCase().includes(q))
      );
    }

    // 2. Category Filter
    if (category) {
      results = results.filter((p) => p.category.toLowerCase() === category.toLowerCase());
    }

    // 3. Tag Filter
    if (tag) {
      results = results.filter((p) => p.tags.includes(tag.toLowerCase()));
    }

    // 4. Compatibility filtering (if client_engine / version is specified)
    const itemsWithCompat = results.map((p) => {
      const latest = this.getLatestVersion(p);
      const latestCompat = this.getLatestCompatibleVersion(
        p,
        client_engine,
        client_version,
        miyuna_version
      );
      return {
        plugin: p,
        latest,
        latestCompat,
      };
    });

    // If client engine is requested, keep only plugins that have at least one compatible version
    const filtered = (client_engine || miyuna_version)
      ? itemsWithCompat.filter((i) => i.latestCompat !== undefined)
      : itemsWithCompat;

    // Pagination
    const total = filtered.length;
    const totalPages = Math.ceil(total / limit) || 1;
    const startIndex = (page - 1) * limit;
    const paged = filtered.slice(startIndex, startIndex + limit);

    const items = paged.map(({ plugin, latest, latestCompat }) => ({
      id: plugin.id,
      name: plugin.name,
      description: plugin.description,
      category: plugin.category,
      tags: plugin.tags,
      author: plugin.author,
      latestVersion: latest?.version || '0.0.0',
      latestCompatibleVersion: latestCompat?.version || null,
      downloads: plugin.downloads,
      verifiedPublisher: plugin.verifiedPublisher,
      updatedAt: plugin.updatedAt,
    }));

    return {
      items,
      pagination: {
        total,
        page,
        limit,
        totalPages,
      },
    };
  }
}
