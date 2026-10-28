/**
 * @file rpc.ts
 * Typed JSON-RPC 2.0 message contracts and standard error codes for the Capability Broker.
 */

export type RequestId = string | number;

/**
 * Standard JSON-RPC 2.0 and Miyuna Capability Broker error codes.
 */
export enum BrokerErrorCode {
  // Standard JSON-RPC 2.0 codes
  PARSE_ERROR = -32700,
  INVALID_REQUEST = -32600,
  METHOD_NOT_FOUND = -32601,
  INVALID_PARAMS = -32602,
  INTERNAL_ERROR = -32603,

  // Miyuna Broker specific codes (-32000 to -32099)
  PERMISSION_DENIED = -32001,
  QUOTA_EXCEEDED = -32002,
  CAPABILITY_UNSUPPORTED = -32003,
  CAPABILITY_TIMEOUT = -32004,
  CAPABILITY_PROVIDER_ERROR = -32005,
  RATE_LIMIT_EXCEEDED = -32006,
}

export interface JsonRpcError<TData = unknown> {
  code: BrokerErrorCode | number;
  message: string;
  data?: TData;
}

export interface JsonRpcRequest<TParams = Record<string, unknown>> {
  jsonrpc: '2.0';
  id: RequestId;
  method: string;
  params?: TParams;
}

export interface JsonRpcNotification<TParams = Record<string, unknown>> {
  jsonrpc: '2.0';
  method: string;
  params?: TParams;
}

export interface JsonRpcSuccessResponse<TResult = unknown> {
  jsonrpc: '2.0';
  id: RequestId;
  result: TResult;
}

export interface JsonRpcErrorResponse<TData = unknown> {
  jsonrpc: '2.0';
  id: RequestId | null;
  error: JsonRpcError<TData>;
}

export type JsonRpcResponse<TResult = unknown, TData = unknown> =
  | JsonRpcSuccessResponse<TResult>
  | JsonRpcErrorResponse<TData>;

export type JsonRpcMessage =
  | JsonRpcRequest
  | JsonRpcNotification
  | JsonRpcSuccessResponse
  | JsonRpcErrorResponse;

// Standard Broker Invocations
export interface BrokerInvokeParams {
  capability: string;
  action: string;
  args?: Record<string, unknown>;
}

export interface BrokerSubscribeParams {
  topic: string;
  filter?: Record<string, unknown>;
}

export interface BrokerUnsubscribeParams {
  subscriptionId: string;
}

export interface BrokerPublishParams {
  topic: string;
  payload: unknown;
}

export interface CapabilitySummary {
  name: string;
  available: boolean;
  version?: string;
  supportedActions?: string[];
}

export interface BrokerGetCapabilitiesResult {
  capabilities: CapabilitySummary[];
}

// Helpers
export function createRpcRequest<TParams = Record<string, unknown>>(
  id: RequestId,
  method: string,
  params?: TParams
): JsonRpcRequest<TParams> {
  return {
    jsonrpc: '2.0',
    id,
    method,
    ...(params !== undefined ? { params } : {}),
  };
}

export function createRpcNotification<TParams = Record<string, unknown>>(
  method: string,
  params?: TParams
): JsonRpcNotification<TParams> {
  return {
    jsonrpc: '2.0',
    method,
    ...(params !== undefined ? { params } : {}),
  };
}

export function createRpcSuccessResponse<TResult = unknown>(
  id: RequestId,
  result: TResult
): JsonRpcSuccessResponse<TResult> {
  return {
    jsonrpc: '2.0',
    id,
    result,
  };
}

export function createRpcErrorResponse<TData = unknown>(
  id: RequestId | null,
  code: BrokerErrorCode | number,
  message: string,
  data?: TData
): JsonRpcErrorResponse<TData> {
  return {
    jsonrpc: '2.0',
    id,
    error: {
      code,
      message,
      ...(data !== undefined ? { data } : {}),
    },
  };
}
