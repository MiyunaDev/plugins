/**
 * @file network-provider.ts
 * Domain-filtered network proxy provider with secure host credential injection and timeout controls.
 */

import { NetworkFetchArgs, NetworkFetchResult } from '../../../contracts/src/capabilities.js';
import { STANDARD_CAPABILITIES } from '../../../contracts/src/capabilities.js';
import { ICapabilityHandler } from '../broker/broker.js';
import { SecureKeyringProvider } from './credential-provider.js';

export class NetworkSecurityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NetworkSecurityError';
  }
}

export interface NetworkProviderOptions {
  defaultTimeoutMs?: number;
  maxTimeoutMs?: number;
  maxPayloadBytes?: number;
  keyring?: SecureKeyringProvider;
}

export class NetworkProxyProvider {
  private allowedDomains = new Map<string, string[]>(); // pluginId -> allowed domain patterns
  private defaultTimeoutMs: number;
  private maxTimeoutMs: number;
  private maxPayloadBytes: number;
  private keyring?: SecureKeyringProvider;

  constructor(options: NetworkProviderOptions = {}) {
    this.defaultTimeoutMs = options.defaultTimeoutMs ?? 15000;
    this.maxTimeoutMs = options.maxTimeoutMs ?? 30000;
    this.maxPayloadBytes = options.maxPayloadBytes ?? 10 * 1024 * 1024; // 10MB
    this.keyring = options.keyring;
  }

  public setAllowedDomains(pluginId: string, domains: string[]): void {
    this.allowedDomains.set(pluginId, domains);
  }

  public getAllowedDomains(pluginId: string): string[] {
    return this.allowedDomains.get(pluginId) ?? [];
  }

  /**
   * Checks whether a target URL matches the plugin's allowed domain whitelist.
   */
  public isDomainAllowed(pluginId: string, urlStr: string): boolean {
    const whitelist = this.getAllowedDomains(pluginId);
    if (whitelist.includes('*')) return true;

    try {
      const parsed = new URL(urlStr);
      const hostname = parsed.hostname.toLowerCase();
      const hostWithPort = parsed.host.toLowerCase();

      for (const pattern of whitelist) {
        const lowerPattern = pattern.toLowerCase();
        if (lowerPattern === hostname || lowerPattern === hostWithPort) {
          return true;
        }

        // Wildcard match (e.g. *.example.com)
        if (lowerPattern.startsWith('*.')) {
          const rootDomain = lowerPattern.slice(2);
          if (hostname === rootDomain || hostname.endsWith(`.${rootDomain}`)) {
            return true;
          }
        }
      }

      return false;
    } catch {
      return false;
    }
  }

  /**
   * Executes an outbound HTTP request on behalf of an authorized plugin.
   */
  public async fetch(
    pluginId: string,
    args: NetworkFetchArgs & { credentialHeader?: string }
  ): Promise<NetworkFetchResult> {
    const { url, method = 'GET', headers = {}, body, credentialId, credentialHeader, timeoutMs } = args;

    if (!url) {
      throw new Error("Missing 'url' parameter for network.fetch");
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch (err: any) {
      throw new Error(`Invalid URL: ${err.message}`);
    }

    // Protocol check
    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      throw new NetworkSecurityError(
        `Disallowed protocol '${parsedUrl.protocol}'. Only 'http:' and 'https:' are permitted.`
      );
    }

    // Domain check
    if (!this.isDomainAllowed(pluginId, url)) {
      throw new NetworkSecurityError(
        `Security Error: Plugin '${pluginId}' is not authorized to access host '${parsedUrl.host}'`
      );
    }

    // Prepare headers
    const reqHeaders: Record<string, string> = { ...headers };

    // Host-side credential injection (if requested and keyring available)
    if (credentialId && this.keyring) {
      const secret = await this.keyring.getSecretForHost(pluginId, credentialId);
      if (secret) {
        const headerName = credentialHeader || 'X-Emby-Token'; // Default to Jellyfin/Emby or Authorization
        reqHeaders[headerName] = secret;
      }
    }

    // Timeout calculation
    const timeout = Math.min(timeoutMs || this.defaultTimeoutMs, this.maxTimeoutMs);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(parsedUrl.toString(), {
        method,
        headers: reqHeaders,
        body: ['GET', 'HEAD'].includes(method.toUpperCase()) ? undefined : body,
        signal: controller.signal,
      });

      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((val, key) => {
        responseHeaders[key.toLowerCase()] = val;
      });

      // Response body read with size capping
      const text = await response.text();
      if (Buffer.byteLength(text, 'utf-8') > this.maxPayloadBytes) {
        throw new Error(
          `Response payload exceeds maximum allowed size of ${this.maxPayloadBytes} bytes`
        );
      }

      return {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders,
        body: text,
      };
    } catch (err: any) {
      if (err.name === 'AbortError' || controller.signal.aborted) {
        throw new Error(`Network request to '${parsedUrl.host}' timed out after ${timeout}ms`);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }
}

/**
 * Creates a standard Capability Handler for NetworkProxyProvider.
 */
export function createNetworkCapabilityHandler(provider: NetworkProxyProvider): ICapabilityHandler {
  return {
    name: STANDARD_CAPABILITIES.NETWORK_FETCH,
    version: '1.0.0',
    supportedActions: ['fetch'],
    async handle(action: string, args: Record<string, unknown> | undefined, pluginId: string) {
      if (action !== 'fetch') {
        throw new Error(`Unsupported network action: '${action}'`);
      }
      return provider.fetch(pluginId, args as unknown as NetworkFetchArgs);
    },
  };
}
