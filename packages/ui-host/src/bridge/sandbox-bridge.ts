/**
 * @file sandbox-bridge.ts
 * Asynchronous MessagePort bridge mediating communication between a sandboxed UI context and CapabilityBroker.
 */

import {
  JsonRpcRequest,
  JsonRpcResponse,
  JsonRpcNotification,
  createRpcErrorResponse,
  BrokerErrorCode,
} from '../../../contracts/src/rpc.js';
import { CapabilityBroker } from '../../../runtime/src/broker/broker.js';

export interface IMessagePort {
  postMessage(message: unknown): void;
  onmessage?: ((event: { data: unknown }) => void) | null;
  addEventListener?(type: 'message', listener: (event: { data: unknown }) => void): void;
  removeEventListener?(type: 'message', listener: (event: { data: unknown }) => void): void;
  close?(): void;
}

export interface BridgeOptions {
  handshakeTimeoutMs?: number;
}

export class SandboxBridge {
  private isConnected = false;

  constructor(
    public readonly pluginId: string,
    private broker: CapabilityBroker,
    private port: IMessagePort,
    private options: BridgeOptions = {}
  ) {
    this.attachMessageListener();
  }

  private attachMessageListener(): void {
    const handler = async (event: { data: unknown }) => {
      const msg = event.data;
      if (!msg || typeof msg !== 'object') return;

      // Handle bridge handshake
      if ((msg as any).type === 'MIYUNA_BRIDGE_READY') {
        this.isConnected = true;
        return;
      }

      // Check if it's a JSON-RPC request
      if ((msg as any).jsonrpc === '2.0' && 'id' in (msg as any)) {
        await this.handleIncomingRpc(msg as JsonRpcRequest);
      }
    };

    if (this.port.addEventListener) {
      this.port.addEventListener('message', handler);
    } else {
      this.port.onmessage = handler;
    }
  }

  /**
   * Sends initial handshake message to the sandboxed frame.
   */
  public initializeHandshake(): void {
    this.port.postMessage({
      type: 'MIYUNA_INIT_BRIDGE',
      pluginId: this.pluginId,
      timestamp: Date.now(),
    });
  }

  /**
   * Handles an incoming JSON-RPC 2.0 request from the sandboxed iframe.
   */
  public async handleIncomingRpc(request: JsonRpcRequest): Promise<void> {
    try {
      const response: JsonRpcResponse = await this.broker.handleRequest(this.pluginId, request);
      this.port.postMessage(response);
    } catch (err: any) {
      const errorResponse = createRpcErrorResponse(
        request.id ?? null,
        BrokerErrorCode.INTERNAL_ERROR,
        `Bridge dispatch error: ${err?.message || String(err)}`
      );
      this.port.postMessage(errorResponse);
    }
  }

  /**
   * Emits a typed event or notification to the sandboxed frame.
   */
  public sendNotification(notification: JsonRpcNotification): void {
    this.port.postMessage(notification);
  }

  public get ready(): boolean {
    return this.isConnected;
  }

  public close(): void {
    this.isConnected = false;
    if (this.port.close) {
      this.port.close();
    }
  }
}
