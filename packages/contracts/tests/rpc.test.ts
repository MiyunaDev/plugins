import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  BrokerErrorCode,
  createRpcRequest,
  createRpcNotification,
  createRpcSuccessResponse,
  createRpcErrorResponse,
  BrokerInvokeParams,
} from '../src/rpc.js';

describe('JSON-RPC 2.0 Capability Broker Protocol', () => {
  describe('Message Builders', () => {
    test('creates valid JSON-RPC request', () => {
      const params: BrokerInvokeParams = {
        capability: 'storage.local',
        action: 'getItem',
        args: { key: 'userTheme' },
      };
      const req = createRpcRequest('req-1', 'broker.invoke', params);

      assert.equal(req.jsonrpc, '2.0');
      assert.equal(req.id, 'req-1');
      assert.equal(req.method, 'broker.invoke');
      assert.deepEqual(req.params, params);
    });

    test('creates valid JSON-RPC notification (no id)', () => {
      const notif = createRpcNotification('naviah.sync.progress', {
        progress: 75,
      });

      assert.equal(notif.jsonrpc, '2.0');
      assert.equal((notif as any).id, undefined);
      assert.equal(notif.method, 'naviah.sync.progress');
      assert.deepEqual(notif.params, { progress: 75 });
    });

    test('creates valid JSON-RPC success response', () => {
      const res = createRpcSuccessResponse('req-1', { success: true });

      assert.equal(res.jsonrpc, '2.0');
      assert.equal(res.id, 'req-1');
      assert.deepEqual(res.result, { success: true });
    });

    test('creates valid JSON-RPC error response with Miyuna error code', () => {
      const res = createRpcErrorResponse(
        'req-2',
        BrokerErrorCode.PERMISSION_DENIED,
        "Permission Denied: capability 'network.fetch' not granted",
        { requiredCapability: 'network.fetch' }
      );

      assert.equal(res.jsonrpc, '2.0');
      assert.equal(res.id, 'req-2');
      assert.equal(res.error.code, -32001);
      assert.ok(res.error.message.includes('Permission Denied'));
      assert.deepEqual(res.error.data, { requiredCapability: 'network.fetch' });
    });
  });

  describe('Broker Error Codes', () => {
    test('standard JSON-RPC error codes are correctly mapped', () => {
      assert.equal(BrokerErrorCode.PARSE_ERROR, -32700);
      assert.equal(BrokerErrorCode.INVALID_REQUEST, -32600);
      assert.equal(BrokerErrorCode.METHOD_NOT_FOUND, -32601);
      assert.equal(BrokerErrorCode.INVALID_PARAMS, -32602);
      assert.equal(BrokerErrorCode.INTERNAL_ERROR, -32603);
    });

    test('Miyuna broker error codes are in reserved -32000 to -32099 range', () => {
      assert.equal(BrokerErrorCode.PERMISSION_DENIED, -32001);
      assert.equal(BrokerErrorCode.QUOTA_EXCEEDED, -32002);
      assert.equal(BrokerErrorCode.CAPABILITY_UNSUPPORTED, -32003);
      assert.equal(BrokerErrorCode.CAPABILITY_TIMEOUT, -32004);
      assert.equal(BrokerErrorCode.CAPABILITY_PROVIDER_ERROR, -32005);
      assert.equal(BrokerErrorCode.RATE_LIMIT_EXCEEDED, -32006);
    });
  });
});
