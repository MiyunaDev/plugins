/**
 * @file capabilities.ts
 * Standard Capabilities catalog, operation signatures, and permission grant models.
 */

export const STANDARD_CAPABILITIES = {
  STORAGE_LOCAL: 'storage.local',
  NETWORK_FETCH: 'network.fetch',
  DEVICE_NAVIAH_SYNC: 'device.naviah-sync',
  AUTH_SECURE_KEYRING: 'auth.secureKeyring',
  UI_CANVAS: 'ui.canvas',
  CLIPBOARD_READ: 'clipboard.read',
  CLIPBOARD_WRITE: 'clipboard.write',
  EVENT_BUS: 'event.bus',
} as const;

export type StandardCapabilityName =
  (typeof STANDARD_CAPABILITIES)[keyof typeof STANDARD_CAPABILITIES];

export type PermissionGrantStatus = 'granted' | 'denied' | 'prompt';

export interface PermissionGrant {
  pluginId: string;
  capability: string;
  grantedAt: number;
  grantedBy: 'user' | 'policy' | 'admin';
  status: PermissionGrantStatus;
  constraints?: {
    quotaBytes?: number;
    allowedDomains?: string[];
    allowedOperations?: string[];
  };
}

// Capability-Specific Operation Payload Types

// 1. Storage Operations
export interface StorageGetItemArgs {
  key: string;
}

export interface StorageSetItemArgs {
  key: string;
  value: unknown;
}

export interface StorageRemoveItemArgs {
  key: string;
}

export interface StorageUsageResult {
  bytesUsed: number;
  quotaBytes: number;
  remainingBytes: number;
  keyCount: number;
}

// 2. Network Operations
export interface NetworkFetchArgs {
  url: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD';
  headers?: Record<string, string>;
  body?: string;
  credentialId?: string; // Injects host-managed secret into request header
  timeoutMs?: number;
}

export interface NetworkFetchResult {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
}

// 3. Naviah Sync Operations
export interface NaviahSyncStatusResult {
  state: 'idle' | 'discovering' | 'syncing' | 'completed' | 'error';
  lastSyncedAt?: number;
  activeSessionId?: string;
  progressPercent?: number;
  bytesTransferred?: number;
}

export interface NaviahPeer {
  id: string;
  name: string;
  deviceType: 'mobile' | 'desktop' | 'tablet';
  address: string;
  port: number;
}

export interface NaviahDiscoverPeersResult {
  peers: NaviahPeer[];
}

export interface NaviahStartSyncArgs {
  peerId: string;
  scopes: string[]; // e.g. ["favorites", "reading_history", "offline_cache"]
}

export interface NaviahStartSyncResult {
  sessionId: string;
  startedAt: number;
}

export interface NaviahCancelSyncArgs {
  sessionId: string;
}

// 4. Secure Keyring Operations
export interface KeyringStoreArgs {
  credentialId: string;
  secret: string;
}

export interface KeyringStatusResult {
  hasSecret: boolean;
  credentialId: string;
}

// Validation Utilities
export function isStandardCapability(name: string): boolean {
  return Object.values(STANDARD_CAPABILITIES).includes(name as StandardCapabilityName);
}

export function parseQuotaStringToBytes(quota?: string): number {
  if (!quota) return 10 * 1024 * 1024; // 10MB default
  const match = quota.trim().toUpperCase().match(/^(\d+)(KB|MB|GB)$/);
  if (!match) return 10 * 1024 * 1024;
  const val = parseInt(match[1], 10);
  const unit = match[2];
  if (unit === 'KB') return val * 1024;
  if (unit === 'MB') return val * 1024 * 1024;
  if (unit === 'GB') return val * 1024 * 1024 * 1024;
  return 10 * 1024 * 1024;
}
