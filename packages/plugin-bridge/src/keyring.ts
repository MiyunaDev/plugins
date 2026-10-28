/**
 * @file keyring.ts
 * Typed helper client for the auth.secureKeyring capability.
 */

import { MiyunaBridge } from './bridge.js';

export interface CredentialStatus {
  exists: boolean;
  metadata?: Record<string, unknown>;
  updatedAt?: number;
}

export class KeyringClient {
  constructor(private bridge: MiyunaBridge) {}

  async storeCredential(
    credentialId: string,
    secret: string,
    metadata?: Record<string, unknown>
  ): Promise<{ success: boolean; credentialId: string }> {
    return this.bridge.invoke('auth.secureKeyring', 'storeCredential', {
      credentialId,
      secret,
      metadata,
    });
  }

  async hasCredential(credentialId: string): Promise<CredentialStatus> {
    return this.bridge.invoke('auth.secureKeyring', 'hasCredential', { credentialId });
  }

  async deleteCredential(credentialId: string): Promise<boolean> {
    return this.bridge.invoke('auth.secureKeyring', 'deleteCredential', { credentialId });
  }

  async listCredentials(): Promise<Array<{ credentialId: string; metadata?: Record<string, unknown>; updatedAt?: number }>> {
    return this.bridge.invoke('auth.secureKeyring', 'listCredentials');
  }
}
