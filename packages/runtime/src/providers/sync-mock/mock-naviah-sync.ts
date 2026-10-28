/**
 * @file mock-naviah-sync.ts
 * Headless deterministic Mock Naviah Sync capability provider with progress simulation and fault injection.
 */

import {
  NaviahPeer,
  NaviahSyncStatusResult,
  NaviahStartSyncArgs,
  NaviahStartSyncResult,
  STANDARD_CAPABILITIES,
} from '../../../../contracts/src/capabilities.js';
import { ICapabilityProvider, ProviderRegistrationContext } from '../../broker/provider-registry.js';

export type SyncFaultMode = 'none' | 'timeout' | 'connection_loss' | 'quota_error';

export interface MockNaviahSyncOptions {
  peers?: NaviahPeer[];
  autoProgress?: boolean;
  progressIntervalMs?: number;
}

export class MockNaviahSyncProvider implements ICapabilityProvider {
  public readonly name = STANDARD_CAPABILITIES.DEVICE_NAVIAH_SYNC;
  public readonly version = '1.0.0';
  public readonly supportedActions = ['getSyncStatus', 'discoverPeers', 'startSync', 'cancelSync'];

  private peers: NaviahPeer[];
  private autoProgress: boolean;
  private progressIntervalMs: number;
  private faultMode: SyncFaultMode = 'none';

  private status: NaviahSyncStatusResult = {
    state: 'idle',
    lastSyncedAt: 0,
    progressPercent: 0,
    bytesTransferred: 0,
  };

  private context?: ProviderRegistrationContext;
  private activeTimer?: any;

  constructor(options: MockNaviahSyncOptions = {}) {
    this.autoProgress = options.autoProgress ?? true;
    this.progressIntervalMs = options.progressIntervalMs ?? 50;

    this.peers = options.peers ?? [
      {
        id: 'peer-desktop',
        name: 'Miyuna Desktop Workstation',
        deviceType: 'desktop',
        address: '192.168.1.120',
        port: 49152,
      },
      {
        id: 'peer-mobile',
        name: 'Miyuna Android Phone',
        deviceType: 'mobile',
        address: '192.168.1.135',
        port: 49152,
      },
      {
        id: 'peer-tablet',
        name: 'Miyuna Reading Tablet',
        deviceType: 'tablet',
        address: '192.168.1.140',
        port: 49152,
      },
    ];
  }

  public setFaultMode(mode: SyncFaultMode): void {
    this.faultMode = mode;
  }

  onRegister(context: ProviderRegistrationContext): void {
    this.context = context;
  }

  onUnregister(): void {
    this.cleanup();
  }

  private cleanup(): void {
    if (this.activeTimer) {
      clearInterval(this.activeTimer);
      this.activeTimer = undefined;
    }
  }

  async handle(
    action: string,
    args: Record<string, unknown> | undefined,
    pluginId: string
  ): Promise<unknown> {
    switch (action) {
      case 'getSyncStatus':
        return this.getSyncStatus();

      case 'discoverPeers':
        return this.discoverPeers();

      case 'startSync':
        return this.startSync(args as unknown as NaviahStartSyncArgs, pluginId);

      case 'cancelSync':
        return this.cancelSync(String(args?.sessionId));

      default:
        throw new Error(`Unsupported action '${action}' on '${this.name}'`);
    }
  }

  public getSyncStatus(): NaviahSyncStatusResult {
    return { ...this.status };
  }

  public async discoverPeers(): Promise<{ peers: NaviahPeer[] }> {
    if (this.faultMode === 'connection_loss') {
      throw new Error('Peer discovery failed: local network interface is down');
    }
    return { peers: [...this.peers] };
  }

  public async startSync(
    args: NaviahStartSyncArgs,
    pluginId?: string
  ): Promise<NaviahStartSyncResult> {
    const { peerId, scopes = [] } = args || {};

    if (!peerId) {
      throw new Error("Missing 'peerId' parameter for startSync");
    }

    const peer = this.peers.find((p) => p.id === peerId);
    if (!peer) {
      throw new Error(`Cannot start sync: peer '${peerId}' not found on local network`);
    }

    if (this.status.state === 'syncing') {
      throw new Error('A sync session is already in progress');
    }

    // Check fault modes
    if (this.faultMode === 'timeout') {
      // Hang indefinitely
      await new Promise(() => {});
    }

    if (this.faultMode === 'quota_error') {
      this.status.state = 'error';
      throw new Error('Device storage quota exceeded for sync payload');
    }

    if (this.faultMode === 'connection_loss') {
      this.status.state = 'error';
      throw new Error(`Failed to establish P2P connection to peer '${peerId}'`);
    }

    const sessionId = `sync-${Date.now()}`;
    const startedAt = Date.now();

    this.status = {
      state: 'syncing',
      activeSessionId: sessionId,
      progressPercent: 0,
      bytesTransferred: 0,
      lastSyncedAt: this.status.lastSyncedAt,
    };

    if (this.context) {
      this.context.emitEvent('naviah.sync.started', { sessionId, peerId, scopes }, pluginId);
    }

    if (this.autoProgress) {
      this.runProgressSimulation(sessionId, pluginId);
    }

    return { sessionId, startedAt };
  }

  private runProgressSimulation(sessionId: string, pluginId?: string): void {
    this.cleanup();
    let step = 0;
    const totalSteps = 4;
    const totalBytes = 4 * 1024 * 1024; // 4MB

    this.activeTimer = setInterval(() => {
      if (this.status.activeSessionId !== sessionId || this.status.state !== 'syncing') {
        this.cleanup();
        return;
      }

      step++;
      const progressPercent = Math.min(100, Math.round((step / totalSteps) * 100));
      const bytesTransferred = Math.min(totalBytes, Math.round((step / totalSteps) * totalBytes));

      this.status.progressPercent = progressPercent;
      this.status.bytesTransferred = bytesTransferred;

      if (this.context) {
        this.context.emitEvent(
          'naviah.sync.progress',
          { sessionId, progressPercent, bytesTransferred },
          pluginId
        );
      }

      if (step >= totalSteps) {
        this.cleanup();
        this.status.state = 'completed';
        this.status.lastSyncedAt = Date.now();
        this.status.activeSessionId = undefined;

        if (this.context) {
          this.context.emitEvent(
            'naviah.sync.completed',
            { sessionId, bytesTransferred, completedAt: this.status.lastSyncedAt },
            pluginId
          );
        }
      }
    }, this.progressIntervalMs);
  }

  public cancelSync(sessionId?: string): { success: boolean; cancelledSessionId?: string } {
    this.cleanup();
    const cancelledId = sessionId || this.status.activeSessionId;

    this.status.state = 'idle';
    this.status.activeSessionId = undefined;
    this.status.progressPercent = 0;

    if (this.context && cancelledId) {
      this.context.emitEvent('naviah.sync.cancelled', { sessionId: cancelledId });
    }

    return { success: true, cancelledSessionId: cancelledId };
  }
}
