/**
 * @file verify.ts
 * Verifies the cryptographic integrity and publisher Ed25519 signature of a Miyuna .mpk archive.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseZipBuffer } from '../../../runtime/src/installer/unpacker.js';
import { PluginManifest } from '../../../contracts/src/manifest.js';
import { verifyDataSignature, parsePublicKey } from '../crypto/ed25519.js';

export interface VerifyPackageResult {
  valid: boolean;
  manifest?: PluginManifest;
  filesCount: number;
  hasChecksums: boolean;
  checksumsMatch: boolean;
  hasSignature: boolean;
  signatureVerified: boolean;
  error?: string;
}

/**
 * Programmatically verifies a package buffer against a publisher public key.
 */
export function verifyPackageBuffer(
  packageBuffer: Buffer,
  publicKeyInput?: string | Buffer,
  detachedSignature?: Buffer
): VerifyPackageResult {
  try {
    const files = parseZipBuffer(packageBuffer);

    // 1. Locate manifest
    const manifestEntry = files.find((f) => f.name === 'plugin.json');
    if (!manifestEntry) {
      return {
        valid: false,
        filesCount: files.length,
        hasChecksums: false,
        checksumsMatch: false,
        hasSignature: false,
        signatureVerified: false,
        error: "Package is missing mandatory 'plugin.json'",
      };
    }

    let manifest: PluginManifest;
    try {
      manifest = JSON.parse(manifestEntry.data.toString('utf-8'));
    } catch (err: any) {
      return {
        valid: false,
        filesCount: files.length,
        hasChecksums: false,
        checksumsMatch: false,
        hasSignature: false,
        signatureVerified: false,
        error: `Malformed plugin.json: ${err.message}`,
      };
    }

    // 2. Locate checksums.json
    const checksumsEntry = files.find((f) => f.name === 'checksums.json');
    if (!checksumsEntry) {
      return {
        valid: false,
        manifest,
        filesCount: files.length,
        hasChecksums: false,
        checksumsMatch: false,
        hasSignature: false,
        signatureVerified: false,
        error: "Package is missing 'checksums.json'",
      };
    }

    let checksums: Record<string, string>;
    try {
      checksums = JSON.parse(checksumsEntry.data.toString('utf-8'));
    } catch (err: any) {
      return {
        valid: false,
        manifest,
        filesCount: files.length,
        hasChecksums: true,
        checksumsMatch: false,
        hasSignature: false,
        signatureVerified: false,
        error: `Malformed checksums.json: ${err.message}`,
      };
    }

    // 3. Verify all files match checksums.json
    for (const file of files) {
      if (file.name === 'checksums.json' || file.name === 'signature.sig') continue;
      const expectedSha = checksums[file.name];
      if (!expectedSha) {
        return {
          valid: false,
          manifest,
          filesCount: files.length,
          hasChecksums: true,
          checksumsMatch: false,
          hasSignature: false,
          signatureVerified: false,
          error: `Unlisted file '${file.name}' not found in checksums.json`,
        };
      }
      if (expectedSha !== file.sha256) {
        return {
          valid: false,
          manifest,
          filesCount: files.length,
          hasChecksums: true,
          checksumsMatch: false,
          hasSignature: false,
          signatureVerified: false,
          error: `Tampered file detected: '${file.name}' checksum mismatch (expected ${expectedSha}, got ${file.sha256})`,
        };
      }
    }

    // 4. Verify signature if public key provided or signature exists
    let signatureBuffer = detachedSignature;
    if (!signatureBuffer) {
      const sigEntry = files.find((f) => f.name === 'signature.sig');
      if (sigEntry) {
        signatureBuffer = sigEntry.data;
      }
    }

    const hasSignature = !!signatureBuffer;
    let signatureVerified = false;

    if (publicKeyInput) {
      if (!signatureBuffer) {
        return {
          valid: false,
          manifest,
          filesCount: files.length,
          hasChecksums: true,
          checksumsMatch: true,
          hasSignature: false,
          signatureVerified: false,
          error: 'Public key provided but package contains no signature.sig',
        };
      }

      signatureVerified = verifyDataSignature(
        checksumsEntry.data,
        signatureBuffer,
        publicKeyInput
      );

      if (!signatureVerified) {
        return {
          valid: false,
          manifest,
          filesCount: files.length,
          hasChecksums: true,
          checksumsMatch: true,
          hasSignature: true,
          signatureVerified: false,
          error: 'Ed25519 signature verification failed: signature mismatch or untrusted public key',
        };
      }
    }

    return {
      valid: true,
      manifest,
      filesCount: files.length,
      hasChecksums: true,
      checksumsMatch: true,
      hasSignature,
      signatureVerified,
    };
  } catch (err: any) {
    return {
      valid: false,
      filesCount: 0,
      hasChecksums: false,
      checksumsMatch: false,
      hasSignature: false,
      signatureVerified: false,
      error: `Package verification error: ${err.message}`,
    };
  }
}

/**
 * CLI runner for package verification.
 */
export async function verifyCommand(
  packagePath: string,
  publicKeyPath?: string,
  detachedSignaturePath?: string
): Promise<VerifyPackageResult> {
  const resolvedPkg = resolve(packagePath);
  const pkgBuffer = readFileSync(resolvedPkg);

  let publicKeyContent: string | undefined;
  if (publicKeyPath) {
    publicKeyContent = readFileSync(resolve(publicKeyPath), 'utf-8');
  }

  let detachedSignature: Buffer | undefined;
  if (detachedSignaturePath) {
    detachedSignature = readFileSync(resolve(detachedSignaturePath));
  }

  return verifyPackageBuffer(pkgBuffer, publicKeyContent, detachedSignature);
}
