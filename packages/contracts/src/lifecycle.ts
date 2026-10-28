/**
 * @file lifecycle.ts
 * Plugin Lifecycle State Machine contract and transition rules.
 */

export enum PluginLifecycleState {
  DISCOVERED = 'DISCOVERED',
  UNINSTALLED = 'UNINSTALLED',
  INSTALLED = 'INSTALLED',
  INACTIVE = 'INACTIVE',
  ACTIVATING = 'ACTIVATING',
  ACTIVE = 'ACTIVE',
  DEACTIVATING = 'DEACTIVATING',
  UNINSTALLING = 'UNINSTALLING',
  ERROR = 'ERROR',
}

/**
 * Valid transitions table.
 * Key: source state -> Value: Set of permissible destination states.
 */
export const PERMITTED_TRANSITIONS: Record<PluginLifecycleState, readonly PluginLifecycleState[]> = {
  [PluginLifecycleState.DISCOVERED]: [
    PluginLifecycleState.INSTALLED,
    PluginLifecycleState.ERROR,
  ],
  [PluginLifecycleState.UNINSTALLED]: [
    PluginLifecycleState.DISCOVERED,
    PluginLifecycleState.INSTALLED,
  ],
  [PluginLifecycleState.INSTALLED]: [
    PluginLifecycleState.INACTIVE,
    PluginLifecycleState.UNINSTALLING,
    PluginLifecycleState.ERROR,
  ],
  [PluginLifecycleState.INACTIVE]: [
    PluginLifecycleState.ACTIVATING,
    PluginLifecycleState.UNINSTALLING,
    PluginLifecycleState.ERROR,
  ],
  [PluginLifecycleState.ACTIVATING]: [
    PluginLifecycleState.ACTIVE,
    PluginLifecycleState.ERROR,
    PluginLifecycleState.INACTIVE,
  ],
  [PluginLifecycleState.ACTIVE]: [
    PluginLifecycleState.DEACTIVATING,
    PluginLifecycleState.ERROR,
  ],
  [PluginLifecycleState.DEACTIVATING]: [
    PluginLifecycleState.INACTIVE,
    PluginLifecycleState.ERROR,
  ],
  [PluginLifecycleState.UNINSTALLING]: [
    PluginLifecycleState.UNINSTALLED,
    PluginLifecycleState.ERROR,
  ],
  [PluginLifecycleState.ERROR]: [
    PluginLifecycleState.INACTIVE,
    PluginLifecycleState.UNINSTALLING,
    PluginLifecycleState.UNINSTALLED,
  ],
} as const;

/**
 * Validates whether a state transition is permitted by the lifecycle rules.
 */
export function isValidTransition(
  from: PluginLifecycleState,
  to: PluginLifecycleState
): boolean {
  const allowed = PERMITTED_TRANSITIONS[from];
  return allowed ? allowed.includes(to) : false;
}

export interface PluginHookContext {
  pluginId: string;
  version: string;
  sandboxDirectory?: string;
  grantedCapabilities: string[];
}

export interface PluginLifecycleHooks {
  onInstall?: (context: PluginHookContext) => Promise<void> | void;
  onActivate?: (context: PluginHookContext) => Promise<void> | void;
  onDeactivate?: (context: PluginHookContext) => Promise<void> | void;
  onUninstall?: (context: PluginHookContext) => Promise<void> | void;
}

export interface PluginRuntimeStatus {
  pluginId: string;
  state: PluginLifecycleState;
  lastTransitionAt: number;
  errorMessage?: string;
  installedVersion: string;
  enabled: boolean;
}
