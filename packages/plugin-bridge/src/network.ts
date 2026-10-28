/**
 * @file network.ts
 * Typed helper client for the network.fetch capability.
 */

import { MiyunaBridge } from './bridge.js';

export interface NetworkFetchOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD';
  headers?: Record<string, string>;
  body?: string;
  credentialId?: string;
  credentialHeader?: string;
  timeoutMs?: number;
}

export interface NetworkResponse<T = unknown> {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  json(): T;
}

export class NetworkClient {
  constructor(private bridge: MiyunaBridge) {}

  async fetch<T = unknown>(url: string, options: NetworkFetchOptions = {}): Promise<NetworkResponse<T>> {
    const raw: any = await this.bridge.invoke('network.fetch', 'fetch', {
      url,
      ...options,
    });

    return {
      status: raw.status,
      statusText: raw.statusText,
      headers: raw.headers || {},
      body: raw.body || '',
      json: () => JSON.parse(raw.body || '{}') as T,
    };
  }
}
