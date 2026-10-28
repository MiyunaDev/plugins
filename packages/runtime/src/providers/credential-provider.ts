/**
 * @file credential-provider.ts
 * Host Secure Credential Keyring provider for storing third-party secrets without exposing raw tokens to plugin sandboxes.
 */

import { BrokerErrorCode } from '../../../contracts/src/rpc.js';
import { STANDARD_CAPABILITIES } from '../../../contracts/src/capabilities.js';
import { ICapabilityHandler } from '../broker/broker.js';

export interface CredentialRecord {
  pluginId: string;
  credentialId: string;
  secret: string;
  metadata?: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

export interface IKeyringBackend {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<boolean>;
  listKeys(prefix: string): Promise<string[]>;
}

export class MemoryKeyringBackend implements IKeyringBackend {
  private store = new Map<string, string>();

  async get(key: string): Promise<string | null> {
    return this.store.get(key) ?? null;
  }

  async set(key: string, value: string): Promise<void> {
    this.store.set(key, value);
  }

  async delete(key: string): Promise<boolean> {
    return this.store.delete(key);
  }

  async listKeys(prefix: string): Promise<string[]> {
    const keys: string[] = [];
    for (const k of this.store.keys()) {
      if (k.startsWith(prefix)) {
        keys.push(k);
      }
    }
    return keys;
  }
}

export class SecureKeyringProvider {
  constructor(private backend: IKeyringBackend = new MemoryKeyringBackend()) {}

  private makeKey(pluginId: string, credentialId: string): string {
    return `keyring:${pluginId}:${credentialId}`;
  }

  private makePrefix(pluginId: string): string {
    return `keyring:${pluginId}:`;
  }

  /**
   * Stores a credential secret securely for a plugin.
   */
  async storeCredential(
    pluginId: string,
    credentialId: string,
    secret: string,
    metadata?: Record<string, unknown>
  ): Promise<{ success: boolean; credentialId: string }> {
    if (!credentialId || !secret) {
      throw new Error("Both 'credentialId' and 'secret' are required");
    }

    const now = Date.now();
    const existingRaw = await this.backend.get(this.makeKey(pluginId, credentialId));
    let createdAt = now;

    if (existingRaw) {
      try {
        const parsed = JSON.parse(existingRaw) as CredentialRecord;
        createdAt = parsed.createdAt;
      } catch {
        // ignore
      }
    }

    const record: CredentialRecord = {
      pluginId,
      credentialId,
      secret,
      metadata,
      createdAt,
      updatedAt: now,
    };

    await this.backend.set(this.makeKey(pluginId, credentialId), JSON.stringify(record));
    return { success: true, credentialId };
  }

  /**
   * Checks if a credential exists and returns public metadata (NEVER returns raw secret).
   */
  async hasCredential(
    pluginId: string,
    credentialId: string
  ): Promise<{ exists: boolean; metadata?: Record<string, unknown>; updatedAt?: number }> {
    const raw = await this.backend.get(this.makeKey(pluginId, credentialId));
    if (!raw) return { exists: false };

    try {
      const parsed = JSON.parse(raw) as CredentialRecord;
      return {
        exists: true,
        metadata: parsed.metadata,
        updatedAt: parsed.updatedAt,
      };
    } catch {
      return { exists: true };
    }
  }

  /**
   * Deletes a stored credential for a plugin.
   */
  async deleteCredential(pluginId: string, credentialId: string): Promise<boolean> {
    return this.backend.delete(this.makeKey(pluginId, credentialId));
  }

  /**
   * Lists available credential IDs for a plugin (no secrets exposed).
   */
  async listCredentials(
    pluginId: string
  ): Promise<Array<{ credentialId: string; metadata?: Record<string, unknown>; updatedAt?: number }>> {
    const prefix = this.makePrefix(pluginId);
    const keys = await this.backend.listKeys(prefix);
    const results: Array<{ credentialId: string; metadata?: Record<string, unknown>; updatedAt?: number }> = [];

    for (const key of keys) {
      const raw = await this.backend.get(key);
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as CredentialRecord;
          results.push({
            credentialId: parsed.credentialId,
            metadata: parsed.metadata,
            updatedAt: parsed.updatedAt,
          });
        } catch {
          // ignore
        }
      }
    }

    return results;
  }

  /**
   * Internal Host API: Retrieves raw secret for authorized host proxy injection.
   * This is NOT accessible to plugin scripts directly through broker dispatch.
   */
  async getSecretForHost(pluginId: string, credentialId: string): Promise<string | null> {
    const raw = await this.backend.get(this.makeKey(pluginId, credentialId));
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as CredentialRecord;
      return parsed.secret;
    } catch {
      return raw;
    }
  }

  /**
   * Clears all credentials associated with a plugin (e.g. on uninstall).
   */
  async clear(pluginId: string): Promise<void> {
    const prefix = this.makePrefix(pluginId);
    const keys = await this.backend.listKeys(prefix);
    for (const k of keys) {
      await this.backend.delete(k);
    }
  }
}

/**
 * Creates a standard Capability Handler for SecureKeyringProvider.
 * Note: getSecret is deliberately EXCLUDED so plugins cannot read raw secrets.
 */
export function createKeyringCapabilityHandler(keyring: SecureKeyringProvider): ICapabilityHandler {
  return {
    name: STANDARD_CAPABILITIES.AUTH_SECURE_KEYRING,
    version: '1.0.0',
    supportedActions: ['storeCredential', 'hasCredential', 'deleteCredential', 'listCredentials'],
    async handle(action: string, args: Record<string, unknown> | undefined, pluginId: string) {
      switch (action) {
        case 'storeCredential':
          return keyring.storeCredential(
            pluginId,
            String(args?.credentialId),
            String(args?.secret),
            args?.metadata as Record<string, unknown> | undefined
          );
        case 'hasCredential':
          return keyring.hasCredential(pluginId, String(args?.credentialId));
        case 'deleteCredential':
          return keyring.deleteCredential(pluginId, String(args?.credentialId));
        case 'listCredentials':
          return keyring.listCredentials(pluginId);
        default:
          throw new Error(`Unsupported keyring action: '${action}'`);
      }
    },
  };
}
