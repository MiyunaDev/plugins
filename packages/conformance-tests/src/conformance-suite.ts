/**
 * @file conformance-suite.ts
 * Standardized Conformance Test Suite verifying host adapters against the Miyuna Plugin Host Contract.
 */

import { IPluginHostAdapter, ConformanceTestReport, TestCaseResult } from './types.js';
import { createStandardConformancePackage } from './harness.js';

export async function runConformanceSuite(
  adapter: IPluginHostAdapter,
  tempInstallDir: string
): Promise<ConformanceTestReport> {
  const results: TestCaseResult[] = [];
  const pluginId = 'org.miyunadev.conformance';

  async function recordTest(
    id: string,
    name: string,
    category: TestCaseResult['category'],
    fn: () => Promise<void>
  ) {
    const start = performance.now();
    try {
      await fn();
      results.push({
        id,
        name,
        category,
        passed: true,
        durationMs: performance.now() - start,
      });
    } catch (err: any) {
      results.push({
        id,
        name,
        category,
        passed: false,
        durationMs: performance.now() - start,
        error: err.message || String(err),
      });
    }
  }

  // Initialize host
  await adapter.initialize(tempInstallDir);
  const standardPkg = createStandardConformancePackage({ id: pluginId });

  // 1. Lifecycle Suite
  await recordTest('CONF-LIFE-01', 'Package install sets status to INACTIVE', 'lifecycle', async () => {
    const status = await adapter.installPlugin(standardPkg);
    if (!status || status.state !== 'INACTIVE') {
      throw new Error(`Expected state 'INACTIVE', got '${status?.state}'`);
    }
    if (status.pluginId !== pluginId) {
      throw new Error(`Expected pluginId '${pluginId}', got '${status?.pluginId}'`);
    }
  });

  await recordTest('CONF-LIFE-02', 'Activation transitions plugin to ACTIVE', 'lifecycle', async () => {
    const status = await adapter.activatePlugin(pluginId);
    if (!status || status.state !== 'ACTIVE') {
      throw new Error(`Expected state 'ACTIVE', got '${status?.state}'`);
    }
  });

  // 2. Broker Suite
  await recordTest('CONF-RPC-01', 'Blocks invocation with PERMISSION_DENIED (-32001) when not granted', 'broker', async () => {
    const rpcReq = {
      jsonrpc: '2.0',
      id: 'test-1',
      method: 'broker.invoke',
      params: {
        capability: 'storage.local',
        action: 'get',
        args: { key: 'sample' },
      },
    };

    const res = await adapter.dispatchRpc(rpcReq, pluginId);
    if (!res.error || res.error.code !== -32001) {
      throw new Error(`Expected error code -32001 (PERMISSION_DENIED), got: ${JSON.stringify(res)}`);
    }
  });

  await recordTest('CONF-RPC-02', 'Rejects unknown capability with CAPABILITY_UNSUPPORTED (-32003)', 'broker', async () => {
    // First grant so it passes permission gate and reaches provider registry
    adapter.grantPermission(pluginId, 'unknown.nonexistent', 'user');

    const rpcReq = {
      jsonrpc: '2.0',
      id: 'test-2',
      method: 'broker.invoke',
      params: {
        capability: 'unknown.nonexistent',
        action: 'op',
      },
    };

    const res = await adapter.dispatchRpc(rpcReq, pluginId);
    if (!res.error || res.error.code !== -32003) {
      throw new Error(`Expected error code -32003 (CAPABILITY_UNSUPPORTED), got: ${JSON.stringify(res)}`);
    }
  });

  await recordTest('CONF-RPC-03', 'Executes capability invocation successfully when permission is granted', 'broker', async () => {
    adapter.grantPermission(pluginId, 'storage.local', 'user');

    const setReq = {
      jsonrpc: '2.0',
      id: 'test-set',
      method: 'broker.invoke',
      params: {
        capability: 'storage.local',
        action: 'setItem',
        args: { key: 'confKey', value: 'confValue' },
      },
    };
    const setRes = await adapter.dispatchRpc(setReq, pluginId);
    if (setRes.error) {
      throw new Error(`storage.local.setItem failed: ${setRes.error.message}`);
    }

    const getReq = {
      jsonrpc: '2.0',
      id: 'test-get',
      method: 'broker.invoke',
      params: {
        capability: 'storage.local',
        action: 'getItem',
        args: { key: 'confKey' },
      },
    };
    const getRes = await adapter.dispatchRpc(getReq, pluginId);
    if (getRes.error || getRes.result !== 'confValue') {
      throw new Error(`storage.local.getItem returned invalid result: ${JSON.stringify(getRes)}`);
    }
  });

  // 3. Storage Isolation Suite
  await recordTest('CONF-STORE-01', 'Enforces strict storage isolation between separate plugin namespaces', 'storage', async () => {
    const secondPluginId = 'org.miyunadev.conformance2';
    const secondPkg = createStandardConformancePackage({ id: secondPluginId });
    await adapter.installPlugin(secondPkg);
    await adapter.activatePlugin(secondPluginId);
    adapter.grantPermission(secondPluginId, 'storage.local', 'user');

    // Attempt to read confKey under secondPluginId namespace
    const getReq = {
      jsonrpc: '2.0',
      id: 'test-other-get',
      method: 'broker.invoke',
      params: {
        capability: 'storage.local',
        action: 'getItem',
        args: { key: 'confKey' },
      },
    };
    const res = await adapter.dispatchRpc(getReq, secondPluginId);
    if (res.result !== undefined && res.result !== null) {
      throw new Error(`Data leakage detected! Other plugin read value: '${res.result}'`);
    }

    await adapter.deactivatePlugin(secondPluginId);
    await adapter.uninstallPlugin(secondPluginId);
  });

  // 4. UI Contribution & Sandboxing Suite
  await recordTest('CONF-UI-01', 'Registers and resolves route contribution with namespaced prefix', 'sandboxing', async () => {
    if (typeof adapter.resolveRoute === 'function') {
      const resolved = adapter.resolveRoute('/ext/org.miyunadev.conformance/dashboard');
      if (!resolved || resolved.contributionId !== 'test-dashboard') {
        throw new Error(`Failed to resolve namespaced route: ${JSON.stringify(resolved)}`);
      }
    }
  });

  await recordTest('CONF-SEC-01', 'Enforces strict iframe sandbox flags and Content Security Policy', 'sandboxing', async () => {
    if (typeof adapter.getSandboxConfig === 'function') {
      const config = adapter.getSandboxConfig(pluginId);
      if (!config) throw new Error('Sandbox configuration is missing');
      if (config.sandbox.includes('allow-same-origin')) {
        throw new Error("Security violation: sandbox attribute must NOT include 'allow-same-origin'");
      }
      if (!config.sandbox.includes('allow-scripts')) {
        throw new Error("Sandbox attribute must include 'allow-scripts'");
      }
      if (!config.csp.includes("object-src 'none'")) {
        throw new Error("CSP must enforce object-src 'none'");
      }
    }
  });

  // 5. Lifecycle Teardown Suite
  await recordTest('CONF-LIFE-03', 'Deactivation transitions plugin to INACTIVE', 'lifecycle', async () => {
    const status = await adapter.deactivatePlugin(pluginId);
    if (!status || status.state !== 'INACTIVE') {
      throw new Error(`Expected state 'INACTIVE', got '${status?.state}'`);
    }
  });

  await recordTest('CONF-LIFE-04', 'Uninstall cleans up plugin and transitions to UNINSTALLED', 'lifecycle', async () => {
    const uninstalled = await adapter.uninstallPlugin(pluginId);
    if (!uninstalled) {
      throw new Error('Uninstall returned false');
    }
    const status = adapter.getPluginStatus(pluginId);
    if (status && status.state !== 'UNINSTALLED') {
      throw new Error(`Expected uninstalled status, got: '${status?.state}'`);
    }
  });

  await adapter.cleanup();

  const passedCount = results.filter((r) => r.passed).length;
  const failedCount = results.filter((r) => !r.passed).length;

  return {
    hostName: adapter.hostName,
    compliant: failedCount === 0,
    totalCount: results.length,
    passedCount,
    failedCount,
    results,
    executedAt: new Date().toISOString(),
  };
}
