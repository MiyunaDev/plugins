/**
 * @file broker.ts
 * Central Capability Broker dispatcher and permission gate for host-plugin JSON-RPC communication.
 */

import {
  JsonRpcRequest,
  JsonRpcResponse,
  BrokerErrorCode,
  createRpcSuccessResponse,
  createRpcErrorResponse,
  BrokerInvokeParams,
  BrokerGetCapabilitiesResult,
  CapabilitySummary,
} from '../../../contracts/src/rpc.js';
import { STANDARD_CAPABILITIES } from '../../../contracts/src/capabilities.js';
import { NamespacedStorageProvider, QuotaExceededError } from '../providers/storage-provider.js';
import { ProviderRegistry, ICapabilityProvider } from './provider-registry.js';

export type ICapabilityHandler = ICapabilityProvider;

export interface IPermissionChecker {
  hasPermission(pluginId: string, capability: string): boolean;
}

export interface BrokerOptions {
  defaultTimeoutMs?: number;
  registry?: ProviderRegistry;
}

export class CapabilityBroker {
  private registry: ProviderRegistry;
  private defaultTimeoutMs: number;

  constructor(
    private permissionChecker: IPermissionChecker,
    options: BrokerOptions = {}
  ) {
    this.registry = options.registry ?? new ProviderRegistry();
    this.defaultTimeoutMs = options.defaultTimeoutMs ?? 10000;
  }

  public getRegistry(): ProviderRegistry {
    return this.registry;
  }

  public registerCapabilityHandler(handler: ICapabilityHandler): void {
    this.registry.register(handler);
  }

  public unregisterCapabilityHandler(capabilityName: string): boolean {
    return this.registry.unregister(capabilityName) as any;
  }

  public hasCapability(capabilityName: string): boolean {
    return this.registry.has(capabilityName);
  }

  public getAvailableCapabilities(): CapabilitySummary[] {
    return this.registry.list();
  }

  /**
   * Dispatches an incoming JSON-RPC request from an authenticated plugin channel.
   */
  public async handleRequest(
    pluginId: string,
    request: JsonRpcRequest
  ): Promise<JsonRpcResponse> {
    const { id, method, params } = request;

    if (request.jsonrpc !== '2.0' || !method) {
      return createRpcErrorResponse(
        id ?? null,
        BrokerErrorCode.INVALID_REQUEST,
        'Invalid JSON-RPC 2.0 request structure'
      );
    }

    try {
      switch (method) {
        case 'broker.getCapabilities': {
          const result: BrokerGetCapabilitiesResult = {
            capabilities: this.getAvailableCapabilities(),
          };
          return createRpcSuccessResponse(id, result);
        }

        case 'broker.invoke': {
          const invokeParams = params as BrokerInvokeParams | undefined;
          if (!invokeParams || !invokeParams.capability || !invokeParams.action) {
            return createRpcErrorResponse(
              id,
              BrokerErrorCode.INVALID_PARAMS,
              "Missing 'capability' or 'action' in invoke params"
            );
          }

          return await this.dispatchInvocation(
            id,
            pluginId,
            invokeParams.capability,
            invokeParams.action,
            invokeParams.args
          );
        }

        default:
          return createRpcErrorResponse(
            id,
            BrokerErrorCode.METHOD_NOT_FOUND,
            `Unknown broker method: '${method}'`
          );
      }
    } catch (err: any) {
      return createRpcErrorResponse(
        id,
        BrokerErrorCode.INTERNAL_ERROR,
        `Internal broker error: ${err?.message || 'unknown error'}`
      );
    }
  }

  private async dispatchInvocation(
    requestId: string | number,
    pluginId: string,
    capability: string,
    action: string,
    args?: Record<string, unknown>
  ): Promise<JsonRpcResponse> {
    // 1. Permission Gate Check
    const isGranted = this.permissionChecker.hasPermission(pluginId, capability);
    if (!isGranted) {
      return createRpcErrorResponse(
        requestId,
        BrokerErrorCode.PERMISSION_DENIED,
        `Permission Denied: Plugin '${pluginId}' has not been granted capability '${capability}'`,
        { requiredCapability: capability }
      );
    }

    // 2. Provider Availability Check
    const handler = this.registry.get(capability);
    if (!handler) {
      return createRpcErrorResponse(
        requestId,
        BrokerErrorCode.CAPABILITY_UNSUPPORTED,
        `Capability '${capability}' is not supported or registered on this host`,
        { capability }
      );
    }

    // 3. Execution with Timeout Enforcement
    try {
      const executionPromise = handler.handle(action, args, pluginId);
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error('TIMEOUT')),
          this.defaultTimeoutMs
        )
      );

      const result = await Promise.race([executionPromise, timeoutPromise]);
      return createRpcSuccessResponse(requestId, result);
    } catch (err: any) {
      if (err?.message === 'TIMEOUT') {
        return createRpcErrorResponse(
          requestId,
          BrokerErrorCode.CAPABILITY_TIMEOUT,
          `Execution of '${capability}.${action}' exceeded timeout of ${this.defaultTimeoutMs}ms`
        );
      }

      if (err instanceof QuotaExceededError || err?.code === BrokerErrorCode.QUOTA_EXCEEDED) {
        return createRpcErrorResponse(
          requestId,
          BrokerErrorCode.QUOTA_EXCEEDED,
          err.message
        );
      }

      return createRpcErrorResponse(
        requestId,
        BrokerErrorCode.CAPABILITY_PROVIDER_ERROR,
        `Provider error executing '${capability}.${action}': ${err?.message || String(err)}`
      );
    }
  }
}

/**
 * Creates a standard Capability Handler for NamespacedStorageProvider.
 */
export function createStorageCapabilityHandler(
  storage: NamespacedStorageProvider
): ICapabilityHandler {
  return {
    name: STANDARD_CAPABILITIES.STORAGE_LOCAL,
    version: '1.0.0',
    supportedActions: ['getItem', 'setItem', 'removeItem', 'clear', 'getKeys', 'getUsage'],
    async handle(action: string, args: Record<string, unknown> | undefined, pluginId: string) {
      switch (action) {
        case 'getItem':
          return storage.getItem(pluginId, String(args?.key));
        case 'setItem':
          return storage.setItem(pluginId, String(args?.key), args?.value);
        case 'removeItem':
          return storage.removeItem(pluginId, String(args?.key));
        case 'clear':
          return storage.clear(pluginId);
        case 'getKeys':
          return storage.getKeys(pluginId);
        case 'getUsage':
          return storage.getUsage(pluginId);
        default:
          throw new Error(`Unsupported storage action: '${action}'`);
      }
    },
  };
}
