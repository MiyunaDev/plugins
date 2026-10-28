import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  CapabilityBroker,
  createStorageCapabilityHandler,
  IPermissionChecker,
} from '../src/broker/broker.js';
import { NamespacedStorageProvider } from '../src/providers/storage-provider.js';
import { createRpcRequest, BrokerErrorCode } from '../../contracts/src/rpc.js';

class MockPermissionChecker implements IPermissionChecker {
  private grants = new Map<string, Set<string>>();

  grant(pluginId: string, capability: string) {
    if (!this.grants.has(pluginId)) {
      this.grants.set(pluginId, new Set());
    }
    this.grants.get(pluginId)!.add(capability);
  }

  hasPermission(pluginId: string, capability: string): boolean {
    return this.grants.get(pluginId)?.has(capability) ?? false;
  }
}

describe('Capability Broker Dispatcher & Permission Gate', () => {
  test('returns available registered capabilities on broker.getCapabilities', async () => {
    const permissions = new MockPermissionChecker();
    const broker = new CapabilityBroker(permissions);
    const storage = new NamespacedStorageProvider();

    broker.registerCapabilityHandler(createStorageCapabilityHandler(storage));

    const req = createRpcRequest('req-caps', 'broker.getCapabilities');
    const res = await broker.handleRequest('org.test.plugin', req);

    assert.equal(res.jsonrpc, '2.0');
    assert.equal(res.id, 'req-caps');
    assert.ok('result' in res);
    const result = (res as any).result;
    assert.equal(result.capabilities.length, 1);
    assert.equal(result.capabilities[0].name, 'storage.local');
  });

  test('blocks invocation and returns PERMISSION_DENIED when permission not granted', async () => {
    const permissions = new MockPermissionChecker();
    const broker = new CapabilityBroker(permissions);
    const storage = new NamespacedStorageProvider();
    broker.registerCapabilityHandler(createStorageCapabilityHandler(storage));

    const pluginId = 'org.unauthorized.plugin';
    // Do NOT grant 'storage.local'

    const req = createRpcRequest('req-fail', 'broker.invoke', {
      capability: 'storage.local',
      action: 'setItem',
      args: { key: 'secret', value: '123' },
    });

    const res = await broker.handleRequest(pluginId, req);

    assert.ok('error' in res);
    const err = (res as any).error;
    assert.equal(err.code, BrokerErrorCode.PERMISSION_DENIED);
    assert.ok(err.message.includes('Permission Denied'));
  });

  test('successfully executes invocation when permission is granted', async () => {
    const permissions = new MockPermissionChecker();
    const broker = new CapabilityBroker(permissions);
    const storage = new NamespacedStorageProvider();
    broker.registerCapabilityHandler(createStorageCapabilityHandler(storage));

    const pluginId = 'org.authorized.plugin';
    permissions.grant(pluginId, 'storage.local');

    const reqSet = createRpcRequest('req-set', 'broker.invoke', {
      capability: 'storage.local',
      action: 'setItem',
      args: { key: 'color', value: 'blue' },
    });
    const resSet = await broker.handleRequest(pluginId, reqSet);
    assert.ok('result' in resSet);

    const reqGet = createRpcRequest('req-get', 'broker.invoke', {
      capability: 'storage.local',
      action: 'getItem',
      args: { key: 'color' },
    });
    const resGet = await broker.handleRequest(pluginId, reqGet);
    assert.ok('result' in resGet);
    assert.equal((resGet as any).result, 'blue');
  });

  test('returns CAPABILITY_UNSUPPORTED when capability is not registered on host', async () => {
    const permissions = new MockPermissionChecker();
    const broker = new CapabilityBroker(permissions);
    const pluginId = 'org.test.plugin';

    // Grant capability that has no registered handler on this host
    permissions.grant(pluginId, 'device.hardware-laser');

    const req = createRpcRequest('req-missing', 'broker.invoke', {
      capability: 'device.hardware-laser',
      action: 'fire',
    });

    const res = await broker.handleRequest(pluginId, req);
    assert.ok('error' in res);
    assert.equal((res as any).error.code, BrokerErrorCode.CAPABILITY_UNSUPPORTED);
  });

  test('enforces timeout on long-running provider calls', async () => {
    const permissions = new MockPermissionChecker();
    // Fast timeout of 50ms for testing
    const broker = new CapabilityBroker(permissions, { defaultTimeoutMs: 50 });

    broker.registerCapabilityHandler({
      name: 'test.slow',
      async handle() {
        // Sleep for 200ms
        await new Promise((r) => setTimeout(r, 200));
        return 'done';
      },
    });

    const pluginId = 'org.test.plugin';
    permissions.grant(pluginId, 'test.slow');

    const req = createRpcRequest('req-timeout', 'broker.invoke', {
      capability: 'test.slow',
      action: 'compute',
    });

    const res = await broker.handleRequest(pluginId, req);
    assert.ok('error' in res);
    assert.equal((res as any).error.code, BrokerErrorCode.CAPABILITY_TIMEOUT);
  });
});
