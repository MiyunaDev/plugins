import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { MiyunaBridge, MiyunaPluginSDK } from '../src/index.js';

class MockMessagePort {
  public messages: any[] = [];
  public onmessage: ((event: { data: any }) => void) | null = null;

  postMessage(data: any): void {
    this.messages.push(data);
  }

  deliver(data: any): void {
    if (this.onmessage) {
      this.onmessage({ data });
    }
  }
}

describe('@miyuna/plugin-bridge Client SDK', () => {
  test('SDK initializes typed namespaces and dispatches JSON-RPC requests', async () => {
    const bridge = new MiyunaBridge();
    const port = new MockMessagePort();
    bridge.setCommunicationPort(port);

    const sdk = new MiyunaPluginSDK(bridge);

    // Call storage.setItem asynchronously
    const promise = sdk.storage.setItem('user_theme', 'dracula');

    // Verify outgoing JSON-RPC message
    assert.equal(port.messages.length, 1);
    const req = port.messages[0];
    assert.equal(req.jsonrpc, '2.0');
    assert.equal(req.method, 'broker.invoke');
    assert.equal(req.params.capability, 'storage.local');
    assert.equal(req.params.action, 'setItem');
    assert.deepEqual(req.params.args, { key: 'user_theme', value: 'dracula' });

    // Mock host response
    port.deliver({
      jsonrpc: '2.0',
      id: req.id,
      result: { success: true, bytesUsed: 25, remainingBytes: 1048500 },
    });

    const res = await promise;
    assert.equal(res.success, true);
    assert.equal(res.bytesUsed, 25);
  });

  test('SDK network client parses JSON response helper', async () => {
    const bridge = new MiyunaBridge();
    const port = new MockMessagePort();
    bridge.setCommunicationPort(port);
    const sdk = new MiyunaPluginSDK(bridge);

    const promise = sdk.network.fetch('https://api.example.com/data');
    const req = port.messages[0];

    port.deliver({
      jsonrpc: '2.0',
      id: req.id,
      result: {
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ count: 42, label: 'test' }),
      },
    });

    const res = await promise;
    assert.equal(res.status, 200);
    const json = res.json();
    assert.equal((json as any).count, 42);
    assert.equal((json as any).label, 'test');
  });

  test('SDK sync client receives event notifications', async () => {
    const bridge = new MiyunaBridge();
    const port = new MockMessagePort();
    bridge.setCommunicationPort(port);
    const sdk = new MiyunaPluginSDK(bridge);

    let progressEventReceived: any = null;
    const unsubscribe = sdk.sync.onProgress((data) => {
      progressEventReceived = data;
    });

    // Simulate host emitting notification
    port.deliver({
      jsonrpc: '2.0',
      method: 'naviah.sync.progress',
      params: { sessionId: 'sync-123', progressPercent: 50, bytesTransferred: 2097152 },
    });

    assert.ok(progressEventReceived !== null);
    assert.equal(progressEventReceived.sessionId, 'sync-123');
    assert.equal(progressEventReceived.progressPercent, 50);

    unsubscribe();
  });

  test('rejects with error when host returns JSON-RPC error response', async () => {
    const bridge = new MiyunaBridge();
    const port = new MockMessagePort();
    bridge.setCommunicationPort(port);
    const sdk = new MiyunaPluginSDK(bridge);

    const promise = sdk.storage.getItem('restricted_key');
    const req = port.messages[0];

    port.deliver({
      jsonrpc: '2.0',
      id: req.id,
      error: {
        code: -32001,
        message: 'Permission Denied: storage.local not granted',
      },
    });

    await assert.rejects(
      async () => {
        await promise;
      },
      (err: any) => err.code === -32001 && err.message.includes('Permission Denied')
    );
  });
});
