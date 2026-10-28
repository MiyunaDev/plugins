/**
 * @file types.ts
 * Type definitions and contract interfaces for Host Client Conformance Testing.
 */

export interface IPluginHostAdapter {
  hostName: string;
  initialize(installDir: string): Promise<void>;
  installPlugin(packageBuffer: Buffer): Promise<any>;
  activatePlugin(pluginId: string): Promise<any>;
  deactivatePlugin(pluginId: string): Promise<any>;
  uninstallPlugin(pluginId: string): Promise<boolean>;
  getPluginStatus(pluginId: string): any;
  grantPermission(pluginId: string, capability: string, grantedBy?: string): void;
  revokePermission(pluginId: string, capability: string): void;
  dispatchRpc(request: any, pluginId?: string): Promise<any>;
  resolveRoute?(path: string): any;
  getSandboxConfig?(pluginId: string): { csp: string; sandbox: string };
  cleanup(): Promise<void>;
}

export interface TestCaseResult {
  id: string;
  name: string;
  category: 'lifecycle' | 'broker' | 'storage' | 'isolation' | 'sandboxing';
  passed: boolean;
  durationMs: number;
  error?: string;
}

export interface ConformanceTestReport {
  hostName: string;
  compliant: boolean;
  totalCount: number;
  passedCount: number;
  failedCount: number;
  results: TestCaseResult[];
  executedAt: string;
}
