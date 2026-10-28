/**
 * @file bridge.ts
 * Core MiyunaBridge client for communication between sandboxed plugins and host Capability Broker.
 */

export interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

export interface BridgeOptions {
  timeoutMs?: number;
}

export class MiyunaBridge {
  private reqId = 0;
  private pending = new Map<
    string | number,
    { resolve: (val: any) => void; reject: (err: any) => void; timer?: any }
  >();
  private notificationListeners = new Map<string, Set<(params: any) => void>>();
  private port: any = null;
  private isReady = false;
  private readyCallbacks: Array<() => void> = [];

  constructor(private options: BridgeOptions = {}) {
    this.setupMessageListener();
    this.notifyHostLoaded();
  }

  private setupMessageListener(): void {
    if (typeof window === 'undefined') return;

    window.addEventListener('message', (event: MessageEvent) => {
      const data = event.data;
      if (!data || typeof data !== 'object') return;

      // 1. Handshake initialization from host
      if (data.type === 'MIYUNA_INIT_BRIDGE') {
        if (event.ports && event.ports[0]) {
          this.port = event.ports[0];
          this.port.onmessage = (e: MessageEvent) => this.handleIncomingMessage(e.data);
          this.port.postMessage({ type: 'MIYUNA_BRIDGE_READY' });
          this.markReady();
        }
        return;
      }

      // Fallback postMessage from parent frame
      if (data.jsonrpc === '2.0') {
        this.handleIncomingMessage(data);
      }
    });
  }

  private notifyHostLoaded(): void {
    if (typeof window !== 'undefined' && window.parent && window.parent !== window) {
      window.parent.postMessage({ type: 'MIYUNA_PLUGIN_LOADED' }, '*');
    }
  }

  public setCommunicationPort(port: any): void {
    this.port = port;
    if (this.port) {
      this.port.onmessage = (e: { data: any }) => this.handleIncomingMessage(e.data);
    }
    this.markReady();
  }

  private markReady(): void {
    this.isReady = true;
    for (const cb of this.readyCallbacks) {
      try {
        cb();
      } catch (err) {
        console.error('Error in bridge ready callback:', err);
      }
    }
    this.readyCallbacks = [];
  }

  public whenReady(): Promise<void> {
    if (this.isReady) return Promise.resolve();
    return new Promise((resolve) => this.readyCallbacks.push(resolve));
  }

  private handleIncomingMessage(msg: any): void {
    if (!msg || msg.jsonrpc !== '2.0') return;

    // Response to a pending request
    if ('id' in msg && msg.id !== undefined && msg.id !== null) {
      const entry = this.pending.get(msg.id);
      if (entry) {
        this.pending.delete(msg.id);
        if (entry.timer) clearTimeout(entry.timer);

        if (msg.error) {
          entry.reject(msg.error);
        } else {
          entry.resolve(msg.result);
        }
      }
      return;
    }

    // Unsolicited notification or event from host
    if (msg.method) {
      const listeners = this.notificationListeners.get(msg.method);
      if (listeners) {
        for (const listener of listeners) {
          try {
            listener(msg.params);
          } catch (err) {
            console.error(`Error in notification listener for '${msg.method}':`, err);
          }
        }
      }
    }
  }

  /**
   * Invokes a capability operation through the Capability Broker.
   */
  public invoke<TResult = unknown>(
    capability: string,
    action: string,
    args?: Record<string, unknown>,
    timeoutMs?: number
  ): Promise<TResult> {
    return new Promise((resolve, reject) => {
      const id = ++this.reqId;
      const timeout = timeoutMs || this.options.timeoutMs || 15000;

      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject({
          code: -32004,
          message: `Broker invocation '${capability}.${action}' timed out after ${timeout}ms`,
        });
      }, timeout);

      this.pending.set(id, { resolve, reject, timer });

      const payload = {
        jsonrpc: '2.0',
        id,
        method: 'broker.invoke',
        params: { capability, action, args },
      };

      if (this.port) {
        this.port.postMessage(payload);
      } else if (typeof window !== 'undefined' && window.parent && window.parent !== window) {
        window.parent.postMessage(payload, '*');
      } else {
        clearTimeout(timer);
        this.pending.delete(id);
        reject({
          code: -32603,
          message: 'No communication channel available to host Capability Broker',
        });
      }
    });
  }

  /**
   * Queries list of capabilities registered and available on the current host client.
   */
  public async getCapabilities(): Promise<Array<{ name: string; available: boolean; version?: string }>> {
    return new Promise((resolve, reject) => {
      const id = ++this.reqId;
      this.pending.set(id, { resolve, reject });

      const payload = {
        jsonrpc: '2.0',
        id,
        method: 'broker.getCapabilities',
      };

      if (this.port) {
        this.port.postMessage(payload);
      } else if (typeof window !== 'undefined' && window.parent && window.parent !== window) {
        window.parent.postMessage(payload, '*');
      } else {
        this.pending.delete(id);
        reject(new Error('Broker channel not available'));
      }
    });
  }

  /**
   * Subscribes to host notifications or broker events.
   */
  public onNotification(method: string, listener: (params: any) => void): () => void {
    if (!this.notificationListeners.has(method)) {
      this.notificationListeners.set(method, new Set());
    }
    this.notificationListeners.get(method)!.add(listener);

    return () => {
      const set = this.notificationListeners.get(method);
      if (set) {
        set.delete(listener);
        if (set.size === 0) {
          this.notificationListeners.delete(method);
        }
      }
    };
  }
}
