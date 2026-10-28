/**
 * @file sync.ts
 * Typed helper client for the device.naviah-sync capability.
 */

import { MiyunaBridge } from './bridge.js';

export interface NaviahPeer {
  id: string;
  name: string;
  deviceType: 'mobile' | 'desktop' | 'tablet';
  address: string;
  port: number;
}

export interface NaviahSyncStatus {
  state: 'idle' | 'discovering' | 'syncing' | 'completed' | 'error';
  lastSyncedAt?: number;
  activeSessionId?: string;
  progressPercent?: number;
  bytesTransferred?: number;
}

export interface StartSyncOptions {
  peerId: string;
  scopes: string[];
}

export class SyncClient {
  constructor(private bridge: MiyunaBridge) {}

  async getSyncStatus(): Promise<NaviahSyncStatus> {
    return this.bridge.invoke('device.naviah-sync', 'getSyncStatus');
  }

  async discoverPeers(): Promise<{ peers: NaviahPeer[] }> {
    return this.bridge.invoke('device.naviah-sync', 'discoverPeers');
  }

  async startSync(options: StartSyncOptions): Promise<{ sessionId: string; startedAt: number }> {
    return this.bridge.invoke('device.naviah-sync', 'startSync', options as any);
  }

  async cancelSync(sessionId?: string): Promise<{ success: boolean; cancelledSessionId?: string }> {
    return this.bridge.invoke('device.naviah-sync', 'cancelSync', { sessionId });
  }

  onProgress(callback: (progress: { sessionId: string; progressPercent: number; bytesTransferred: number }) => void): () => void {
    return this.bridge.onNotification('naviah.sync.progress', callback);
  }

  onCompleted(callback: (data: { sessionId: string; bytesTransferred: number; completedAt: number }) => void): () => void {
    return this.bridge.onNotification('naviah.sync.completed', callback);
  }
}
