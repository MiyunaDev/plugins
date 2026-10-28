/**
 * @file ed25519.ts
 * Cryptographic helpers for Ed25519 key generation, signing, and signature verification.
 */

import {
  generateKeyPairSync,
  sign,
  verify,
  createPrivateKey,
  createPublicKey,
  KeyObject,
} from 'node:crypto';

// Standard 12-byte ASN.1 prefix for Ed25519 SPKI Public Key DER format
const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');

export interface GeneratedKeyPair {
  publicKeyPem: string;
  privateKeyPem: string;
  publicKeyHex: string;
}

/**
 * Generates an Ed25519 key pair in PEM format and returns the 32-byte raw public key hex.
 */
export function generateKeyPair(): GeneratedKeyPair {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519', {
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  const der = createPublicKey(publicKey).export({ type: 'spki', format: 'der' });
  const rawPub = der.subarray(der.length - 32);

  return {
    publicKeyPem: publicKey,
    privateKeyPem: privateKey,
    publicKeyHex: rawPub.toString('hex'),
  };
}

/**
 * Normalizes a private key input (PEM string or Buffer) into a KeyObject.
 */
export function parsePrivateKey(keyInput: string | Buffer): KeyObject {
  if (typeof keyInput === 'string' && keyInput.includes('-----BEGIN PRIVATE KEY-----')) {
    return createPrivateKey({ key: keyInput, format: 'pem' });
  }
  return createPrivateKey(keyInput);
}

/**
 * Normalizes a public key input (PEM string, 64-character hex string, or raw Buffer) into a KeyObject.
 */
export function parsePublicKey(keyInput: string | Buffer): KeyObject {
  if (typeof keyInput === 'string') {
    const trimmed = keyInput.trim();
    if (trimmed.startsWith('-----BEGIN PUBLIC KEY-----')) {
      return createPublicKey({ key: trimmed, format: 'pem' });
    }
    // Check if 64-char hex string (32 bytes raw)
    if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
      const rawBytes = Buffer.from(trimmed, 'hex');
      const der = Buffer.concat([ED25519_SPKI_PREFIX, rawBytes]);
      return createPublicKey({ key: der, format: 'der', type: 'spki' });
    }
  }

  if (Buffer.isBuffer(keyInput) && keyInput.length === 32) {
    const der = Buffer.concat([ED25519_SPKI_PREFIX, keyInput]);
    return createPublicKey({ key: der, format: 'der', type: 'spki' });
  }

  return createPublicKey(keyInput);
}

/**
 * Cryptographically signs data buffer using Ed25519 private key.
 * Returns raw signature Buffer.
 */
export function signData(data: Buffer, privateKeyInput: string | Buffer | KeyObject): Buffer {
  const privateKey =
    typeof privateKeyInput === 'string' || Buffer.isBuffer(privateKeyInput)
      ? parsePrivateKey(privateKeyInput)
      : privateKeyInput;

  return sign(null, data, privateKey);
}

/**
 * Cryptographically verifies an Ed25519 signature against the data buffer.
 */
export function verifyDataSignature(
  data: Buffer,
  signature: Buffer,
  publicKeyInput: string | Buffer | KeyObject
): boolean {
  try {
    const publicKey =
      typeof publicKeyInput === 'string' || Buffer.isBuffer(publicKeyInput)
        ? parsePublicKey(publicKeyInput)
        : publicKeyInput;

    return verify(null, data, publicKey, signature);
  } catch {
    return false;
  }
}
