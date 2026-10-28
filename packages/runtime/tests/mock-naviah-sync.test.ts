import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { MockNaviahSyncProvider } from '../src/providers/sync-mock/mock-naviah-sync.js';

describe('Mock Naviah Sync Capability Provider', () => {
  test('returns initial idle state and discovers mock peers', async () => {
    const provider = new MockNaviahSyncProvider({ autoProgress: false });

    const status = provider.getSyncStatus();
    assert.equal(status.state, 'idle');
    assert.equal(status.progressPercent, 0);

    const { peers } = await provider.discoverPeers();
    assert.ok(peers.length >= 3);
    assert.equal(peers[0].id, 'peer-desktop');
    assert.equal(peers[1].id, 'peer-mobile');
    assert.equal(peers[2].id, 'peer-tablet');
  });

  test('runs automated progress simulation from 0% to 100% completion', async () => {
    // Fast ticker (20ms interval) for test
    const provider = new MockNaviahSyncProvider({ autoProgress: true, progressIntervalMs: 20 });
    const events: Array<{ topic: string; payload: any }> = [];

    provider.onRegister({
      emitEvent(topic, payload) {
        events.push({ topic, payload });
      },
    });

    const startRes = await provider.startSync({
      peerId: 'peer-desktop',
      scopes: ['favorites', 'reading_history'],
    });

    assert.ok(startRes.sessionId.startsWith('sync-'));
    assert.equal(provider.getSyncStatus().state, 'syncing');

    // Wait for simulation to finish (4 steps * 20ms = ~80ms)
    await new Promise((r) => setTimeout(r, 140));

    const finalStatus = provider.getSyncStatus();
    assert.equal(finalStatus.state, 'completed');
    assert.equal(finalStatus.progressPercent, 100);
    assert.ok(finalStatus.lastSyncedAt > 0);

    // Verify progress events were emitted
    assert.ok(events.some((e) => e.topic === 'naviah.sync.started'));
    assert.ok(events.some((e) => e.topic === 'naviah.sync.progress'));
    assert.ok(events.some((e) => e.topic === 'naviah.sync.completed'));
  });

  test('supports session cancellation mid-sync', async () => {
    const provider = new MockNaviahSyncProvider({ autoProgress: true, progressIntervalMs: 50 });
    const events: Array<{ topic: string; payload: any }> = [];

    provider.onRegister({
      emitEvent(topic, payload) {
        events.push({ topic, payload });
      },
    });

    const { sessionId } = await provider.startSync({ peerId: 'peer-mobile', scopes: ['favorites'] });
    assert.equal(provider.getSyncStatus().state, 'syncing');

    // Cancel
    const cancelRes = provider.cancelSync(sessionId);
    assert.equal(cancelRes.success, true);
    assert.equal(provider.getSyncStatus().state, 'idle');
    assert.ok(events.some((e) => e.topic === 'naviah.sync.cancelled'));
  });

  test('handles fault injection modes (connection_loss and quota_error)', async () => {
    const provider = new MockNaviahSyncProvider();

    // 1. Connection loss fault
    provider.setFaultMode('connection_loss');
    await assert.rejects(
      async () => {
        await provider.startSync({ peerId: 'peer-desktop', scopes: [] });
      },
      (err: any) => err.message.includes('Failed to establish P2P connection')
    );
    assert.equal(provider.getSyncStatus().state, 'error');

    // 2. Quota error fault
    provider.setFaultMode('quota_error');
    await assert.rejects(
      async () => {
        await provider.startSync({ peerId: 'peer-desktop', scopes: [] });
      },
      (err: any) => err.message.includes('Device storage quota exceeded')
    );
  });
});
