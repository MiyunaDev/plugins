/**
 * @file manifest.ts
 * Type definitions for Miyuna Plugin Manifest (plugin.json).
 */

export type ArtifactType =
  | 'web-bundle'
  | 'wasm-module'
  | 'service-connector'
  | 'declarative-workflow'
  | 'native-adapter';

export type ContributionType =
  | 'route'
  | 'widget'
  | 'menu-entry'
  | 'event-listener'
  | 'capability-provider';

export interface PluginAuthor {
  name: string;
  email?: string;
  url?: string;
}

export interface ClientEngineSupport {
  web?: boolean | string;
  android?: boolean | string;
  ios?: boolean | string;
  desktop?: boolean | string;
  [key: string]: boolean | string | undefined;
}

export interface PluginEngines {
  miyuna: string; // e.g. ">=1.0.0 <2.0.0"
  client?: ClientEngineSupport;
}

export interface PluginArtifact {
  type: ArtifactType;
  entry: string; // Relative path, e.g. "dist/index.html"
  integrity?: string; // Subresource integrity, e.g. "sha256-..."
}

export interface RouteContribution {
  type: 'route';
  id: string;
  title: string;
  path: string; // e.g. "/main"
  icon?: string;
}

export interface WidgetContribution {
  type: 'widget';
  id: string;
  title: string;
  slot: string; // e.g. "dashboard-card", "sidebar"
  icon?: string;
}

export interface MenuEntryContribution {
  type: 'menu-entry';
  id: string;
  title: string;
  slot: string; // e.g. "profile-menu", "library-tools"
  icon?: string;
}

export interface EventListenerContribution {
  type: 'event-listener';
  id: string;
  title: string;
  events: string[]; // Event topics subscribed to
}

export interface CapabilityProviderContribution {
  type: 'capability-provider';
  id: string;
  title: string;
  providesCapability: string; // Canonical capability ID, e.g. "device.naviah-sync"
}

export type PluginContribution =
  | RouteContribution
  | WidgetContribution
  | MenuEntryContribution
  | EventListenerContribution
  | CapabilityProviderContribution;

export interface CapabilityDeclaration {
  name: string; // e.g. "storage.local", "network.fetch"
  reason?: string;
  quota?: string; // e.g. "10MB"
  domains?: string[]; // Allowed hostnames for network.fetch
  operations?: string[];
}

export interface PluginManifest {
  $schema?: string;
  id: string; // e.g. "org.miyunadev.jellyfin"
  name: string;
  version: string; // Strict semver 2.0.0
  description?: string;
  author: PluginAuthor;
  license?: string;
  homepage?: string;
  icon?: string;
  engines: PluginEngines;
  artifact: PluginArtifact;
  contributions?: PluginContribution[];
  capabilities?: CapabilityDeclaration[];
  dependencies?: Record<string, string>; // peer plugin ID -> semver
}

/**
 * Validates a reverse-domain plugin ID.
 * Example: 'org.miyunadev.demo-plugin' -> true
 */
export function isValidPluginId(id: string): boolean {
  const pluginIdRegex = /^[a-z0-9]+(\.[a-z0-9_-]+)+$/;
  return pluginIdRegex.test(id);
}

/**
 * Validates semantic versioning string according to SemVer 2.0.0.
 */
export function isValidSemver(version: string): boolean {
  const semverRegex =
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;
  return semverRegex.test(version);
}

/**
 * Checks for path traversal vulnerabilities (e.g., '../' or '..\\') in relative asset paths.
 */
export function isSafeRelativePath(path: string): boolean {
  if (!path || path.trim() === '') return false;
  if (path.startsWith('/') || path.startsWith('\\')) return false;
  if (path.includes('..')) return false;
  return true;
}
