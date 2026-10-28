/**
 * @file unpacker.ts
 * Secure package unpacker with strict anti-Zip-Slip validation and SHA-256 integrity verification.
 */

import { inflateRawSync } from 'node:zlib';
import { createHash, verify, createPublicKey } from 'node:crypto';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, normalize, dirname } from 'node:path';
import {
  PluginManifest,
  isValidPluginId,
  isValidSemver,
  isSafeRelativePath,
} from '../../../contracts/src/manifest.js';

const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');

export interface UnpackOptions {
  verifyChecksums?: boolean;
  publicKey?: string | Buffer;
  requireSignature?: boolean;
}

export interface ExtractedFile {
  name: string;
  data: Buffer;
  sha256: string;
}

export interface UnpackResult {
  manifest: PluginManifest;
  destinationDir: string;
  extractedFiles: ExtractedFile[];
  checksumsVerified: boolean;
  signatureVerified: boolean;
}

export class SecurityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SecurityError';
  }
}

export class IntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IntegrityError';
  }
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

/**
 * Parses raw ZIP archive buffer into in-memory file entries with Zip-Slip checks.
 */
export function parseZipBuffer(buffer: Buffer): ExtractedFile[] {
  const files: ExtractedFile[] = [];
  let offset = 0;

  while (offset + 30 <= buffer.length) {
    const signature = buffer.readUInt32LE(offset);

    // Local file header signature: 0x04034b50
    if (signature === 0x04034b50) {
      const compressionMethod = buffer.readUInt16LE(offset + 8);
      const compressedSize = buffer.readUInt32LE(offset + 18);
      const uncompressedSize = buffer.readUInt32LE(offset + 22);
      const fileNameLength = buffer.readUInt16LE(offset + 26);
      const extraFieldLength = buffer.readUInt16LE(offset + 28);

      const fileNameStart = offset + 30;
      const fileNameEnd = fileNameStart + fileNameLength;
      const fileName = buffer.toString('utf-8', fileNameStart, fileNameEnd);

      const dataStart = fileNameEnd + extraFieldLength;
      const dataEnd = dataStart + compressedSize;

      if (dataEnd > buffer.length) {
        throw new SecurityError(`Malformed ZIP archive: truncated file entry '${fileName}'`);
      }

      // Security check: Zip Slip detection
      if (!isSafeRelativePath(fileName)) {
        throw new SecurityError(
          `Directory traversal attempt detected (Zip Slip): entry '${fileName}' is illegal`
        );
      }

      const compressedData = buffer.subarray(dataStart, dataEnd);
      let data: Buffer;

      if (compressionMethod === 0) {
        // Stored (no compression)
        data = Buffer.from(compressedData);
      } else if (compressionMethod === 8) {
        // Deflated
        try {
          data = inflateRawSync(compressedData);
        } catch (err: any) {
          throw new SecurityError(`Failed to decompress '${fileName}': ${err.message}`);
        }
      } else {
        throw new SecurityError(
          `Unsupported compression method ${compressionMethod} in '${fileName}'`
        );
      }

      const sha256 = createHash('sha256').update(data).digest('hex');

      files.push({
        name: fileName,
        data,
        sha256,
      });

      offset = dataEnd;
    } else if (signature === 0x02014b50 || signature === 0x06054b50) {
      // Reached Central Directory or End of Central Directory
      break;
    } else {
      // Scan forward for next header or exit
      offset++;
    }
  }

  return files;
}

/**
 * Safely unpacks a .mpk / ZIP package buffer into destinationDir.
 */
export function unpackPackage(
  buffer: Buffer,
  destinationDir: string,
  options: UnpackOptions = { verifyChecksums: true }
): UnpackResult {
  const normalizedDest = resolve(destinationDir);

  const files = parseZipBuffer(buffer);

  // 1. Locate and parse manifest (plugin.json)
  const manifestEntry = files.find((f) => f.name === 'plugin.json');
  if (!manifestEntry) {
    throw new ValidationError("Package is missing mandatory 'plugin.json' manifest");
  }

  let manifest: PluginManifest;
  try {
    manifest = JSON.parse(manifestEntry.data.toString('utf-8'));
  } catch (err: any) {
    throw new ValidationError(`Failed to parse 'plugin.json': ${err.message}`);
  }

  // Structural manifest checks
  if (!manifest.id || !isValidPluginId(manifest.id)) {
    throw new ValidationError(`Invalid plugin ID in manifest: '${manifest.id}'`);
  }
  if (!manifest.version || !isValidSemver(manifest.version)) {
    throw new ValidationError(`Invalid semver in manifest: '${manifest.version}'`);
  }
  if (!manifest.artifact || !isSafeRelativePath(manifest.artifact.entry)) {
    throw new ValidationError(
      `Invalid or unsafe artifact entry path in manifest: '${manifest.artifact?.entry}'`
    );
  }

  // 2. SHA-256 checksums and optional Ed25519 signature verification
  let checksumsVerified = false;
  let signatureVerified = false;
  const checksumsEntry = files.find((f) => f.name === 'checksums.json');

  if (options.verifyChecksums !== false) {
    if (checksumsEntry) {
      const checksums: Record<string, string> = JSON.parse(checksumsEntry.data.toString('utf-8'));

      for (const file of files) {
        if (file.name === 'checksums.json' || file.name === 'signature.sig') continue;
        const expectedSha = checksums[file.name];
        if (expectedSha && expectedSha !== file.sha256) {
          throw new IntegrityError(
            `Integrity check failed for '${file.name}': expected ${expectedSha}, got ${file.sha256}`
          );
        }
      }
      checksumsVerified = true;
    }
  }

  // Ed25519 signature verification
  const sigEntry = files.find((f) => f.name === 'signature.sig');
  if (options.requireSignature && !sigEntry) {
    throw new SecurityError('Signature verification required, but package contains no signature.sig');
  }

  if (sigEntry && options.publicKey) {
    if (!checksumsEntry) {
      throw new IntegrityError('Cannot verify signature: checksums.json is missing');
    }

    try {
      let pubKeyObj;
      if (typeof options.publicKey === 'string') {
        const trimmed = options.publicKey.trim();
        if (trimmed.startsWith('-----BEGIN PUBLIC KEY-----')) {
          pubKeyObj = createPublicKey({ key: trimmed, format: 'pem' });
        } else if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
          const raw = Buffer.from(trimmed, 'hex');
          pubKeyObj = createPublicKey({
            key: Buffer.concat([ED25519_SPKI_PREFIX, raw]),
            format: 'der',
            type: 'spki',
          });
        } else {
          pubKeyObj = createPublicKey(options.publicKey);
        }
      } else if (Buffer.isBuffer(options.publicKey) && options.publicKey.length === 32) {
        pubKeyObj = createPublicKey({
          key: Buffer.concat([ED25519_SPKI_PREFIX, options.publicKey]),
          format: 'der',
          type: 'spki',
        });
      } else {
        pubKeyObj = createPublicKey(options.publicKey);
      }

      const verified = verify(null, checksumsEntry.data, pubKeyObj, sigEntry.data);
      if (!verified) {
        throw new IntegrityError(
          'Ed25519 signature verification failed: signature mismatch or untrusted key'
        );
      }
      signatureVerified = true;
    } catch (err: any) {
      if (err instanceof IntegrityError) throw err;
      throw new IntegrityError(`Signature verification error: ${err.message}`);
    }
  }

  // 3. Write files to disk securely
  for (const file of files) {
    const targetPath = resolve(normalizedDest, file.name);

    // Defense-in-depth: Ensure resolved target is within destinationDir
    if (!targetPath.startsWith(normalizedDest)) {
      throw new SecurityError(`Zip Slip violation: '${targetPath}' escapes '${normalizedDest}'`);
    }

    const dir = dirname(targetPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    writeFileSync(targetPath, file.data);
  }

  return {
    manifest,
    destinationDir: normalizedDest,
    extractedFiles: files,
    checksumsVerified,
    signatureVerified,
  };
}
