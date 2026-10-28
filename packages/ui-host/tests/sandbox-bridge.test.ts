import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { SandboxBridge, IMessagePort } from '../src/bridge/sandbox-bridge.js';
import { CapabilityBroker, createStorageCapabilityHandler } from '../../runtime/src/broker/broker.js';
import { NamespacedStorageProvider } from '../../runtime/src/providers/storage-provider.js';
import { createRpcRequest, BrokerErrorCode } from '../../contracts/src/rpc.js';

class MockMessagePort implements IMessagePort {
  public messages: unknown[] = [];
  public onmessage: ((event: { data: unknown }) => void) | null = null;
  public isClosed = false;

  postMessage(message: unknown): void {
    this.messages.push(message);
  }

  // Simulate incoming message from iframe
  deliverFromFrame(data: unknown): void {
    if (this.onmessage) {
      this.onmessage({ data });
    }
  }

  close(): void {
    this.isClosed = true;
  }
}

describe('Sandbox MessagePort Bridge & JSON-RPC Gateway', () => {
  test('handles bridge handshake initialization and confirmation', () => {
    const port = new MockMessagePort();
    const broker = new CapabilityBroker({ hasPermission: () => true });
    const bridge = new SandboxBridge('org.miyunadev.test', broker, port);

    bridge.initializeHandshake();

    assert.equal(port.messages.length, 1);
    assert.equal((port.messages[0] as any).type, 'MIYUNA_INIT_BRIDGE');
    assert.equal(bridge.ready, false);

    // Frame sends ready confirmation
    port.deliverFromFrame({ type: 'MIYUNA_BRIDGE_READY' });
    assert.equal(bridge.ready, true);
  });

  test('routes JSON-RPC requests to broker and delivers responses to port', async () => {
    const port = new MockMessagePort();
    const storage = new NamespacedStorageProvider();
    const broker = new CapabilityBroker({ hasPermission: () => true });
    broker.registerCapabilityHandler(createStorageCapabilityHandler(storage));

    const pluginId = 'org.miyunadev.test.bridge';
    const bridge = new SandboxBridge(pluginId, broker, port);

    // Deliver setItem request from frame
    const req = createRpcRequest('req-1', 'broker.invoke', {
      capability: 'storage.local',
      action: 'setItem',
      args: { key: 'level', value: 5 },
    });

    port.deliverFromFrame(req);

    // Wait microtask
    await new Promise((r) => setTimeout(r, 10));

    assert.equal(port.messages.length, 1);
    const res = port.messages[0] as any;
    assert.equal(res.jsonrpc, '2.0');
    assert.equal(res.id, 'req-1');
    assert.ok(res.result !== undefined);
    assert.equal(res.result.success, true);
  });

  test('delivers error response through port when permission is denied', async () => {
    const port = new MockMessagePort();
    const storage = new NamespacedStorageProvider();
    // Deny all permissions
    const broker = new CapabilityBroker({ hasPermission: () => false });
    broker.registerCapabilityHandler(createStorageCapabilityHandler(storage));

    const bridge = new SandboxBridge('org.unauthorized', broker, port);

    const req = createRpcRequest('req-denied', 'broker.invoke', {
      capability: 'storage.local',
      action: 'getItem',
      args: { key: 'secret' },
    });

    port.deliverFromFrame(req);
    await new Promise((r) => setTimeout(r, 10));

    assert.equal(port.messages.length, 1);
    const res = port.messages[0] as any;
    assert.equal(res.id, 'req-denied');
    assert.ok(res.error !== undefined);
    assert.equal(res.error.code, BrokerErrorCode.PERMISSION_DENIED);
  });
});
