import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { ProviderRegistry, ICapabilityProvider } from '../src/broker/provider-registry.js';

describe('Provider Registry & Lifecycle Management', () => {
  test('registers and unregisters providers cleanly with lifecycle hooks', async () => {
    const registry = new ProviderRegistry();
    let registeredCalled = false;
    let unregisteredCalled = false;

    const mockProvider: ICapabilityProvider = {
      name: 'device.test-provider',
      version: '1.2.0',
      supportedActions: ['ping', 'status'],
      async handle(action) {
        return action === 'ping' ? 'pong' : 'ok';
      },
      onRegister(ctx) {
        registeredCalled = true;
        assert.ok(ctx.emitEvent !== undefined);
      },
      onUnregister() {
        unregisteredCalled = true;
      },
    };

    await registry.register(mockProvider);
    assert.equal(registeredCalled, true);
    assert.equal(registry.has('device.test-provider'), true);

    const summaries = registry.list();
    assert.equal(summaries.length, 1);
    assert.equal(summaries[0].name, 'device.test-provider');
    assert.equal(summaries[0].version, '1.2.0');
    assert.deepEqual(summaries[0].supportedActions, ['ping', 'status']);

    const unregResult = await registry.unregister('device.test-provider');
    assert.equal(unregResult, true);
    assert.equal(unregisteredCalled, true);
    assert.equal(registry.has('device.test-provider'), false);
  });

  test('prevents registering duplicate providers with identical names', async () => {
    const registry = new ProviderRegistry();
    const p1: ICapabilityProvider = {
      name: 'service.dup',
      async handle() {
        return null;
      },
    };
    const p2: ICapabilityProvider = {
      name: 'service.dup',
      async handle() {
        return null;
      },
    };

    await registry.register(p1);
    await assert.rejects(
      async () => {
        await registry.register(p2);
      },
      (err: any) => err.message.includes('already registered')
    );
  });

  test('dispatches events to registered event observers', async () => {
    const registry = new ProviderRegistry();
    const receivedEvents: Array<{ topic: string; payload: any }> = [];

    const unsubscribe = registry.onEmitEvent((topic, payload) => {
      receivedEvents.push({ topic, payload });
    });

    const emitterProvider: ICapabilityProvider = {
      name: 'device.emitter',
      async handle() {
        return null;
      },
      onRegister(ctx) {
        ctx.emitEvent('device.status.changed', { battery: 95 });
      },
    };

    await registry.register(emitterProvider);

    assert.equal(receivedEvents.length, 1);
    assert.equal(receivedEvents[0].topic, 'device.status.changed');
    assert.equal(receivedEvents[0].payload.battery, 95);

    unsubscribe();
    registry.emitEvent('device.another', {});
    assert.equal(receivedEvents.length, 1); // No new events after unsubscribe
  });
});
