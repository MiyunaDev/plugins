/**
 * @file sign.ts
 * Signs a Miyuna .mpk plugin archive with an Ed25519 publisher private key.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseZipBuffer } from '../../../runtime/src/installer/unpacker.js';
import { createPackageBuffer, PackageFileEntry } from '../../../runtime/src/installer/packer.js';
import { signData, parsePrivateKey } from '../crypto/ed25519.js';

export interface SignPackageOptions {
  privateKeyPemOrBuffer: string | Buffer;
  detached?: boolean;
}

export interface SignPackageResult {
  signedPackageBuffer: Buffer;
  signatureBuffer: Buffer;
  signatureHex: string;
  signatureBase64: string;
}

/**
 * Signs a package buffer and embeds signature.sig inside the archive.
 */
export function signPackageBuffer(
  packageBuffer: Buffer,
  privateKeyInput: string | Buffer
): SignPackageResult {
  const privateKey = parsePrivateKey(privateKeyInput);
  const files = parseZipBuffer(packageBuffer);

  // Locate checksums.json
  const checksumsEntry = files.find((f) => f.name === 'checksums.json');
  if (!checksumsEntry) {
    throw new Error("Cannot sign package: missing 'checksums.json'");
  }

  // Sign checksums.json bytes
  const signatureBuffer = signData(checksumsEntry.data, privateKey);
  const signatureHex = signatureBuffer.toString('hex');
  const signatureBase64 = signatureBuffer.toString('base64');

  // Filter out existing signature.sig if any, then insert new signature.sig
  const newEntries: PackageFileEntry[] = files
    .filter((f) => f.name !== 'signature.sig')
    .map((f) => ({ path: f.name, content: f.data }));

  newEntries.push({
    path: 'signature.sig',
    content: signatureBuffer,
  });

  const signedPackageBuffer = createPackageBuffer(newEntries);

  return {
    signedPackageBuffer,
    signatureBuffer,
    signatureHex,
    signatureBase64,
  };
}

/**
 * CLI runner for package signing.
 */
export async function signCommand(
  packagePath: string,
  keyPath: string,
  outputPath?: string,
  detached?: boolean
): Promise<SignPackageResult> {
  const resolvedPkg = resolve(packagePath);
  const resolvedKey = resolve(keyPath);

  const pkgBuffer = readFileSync(resolvedPkg);
  const keyContent = readFileSync(resolvedKey, 'utf-8');

  const result = signPackageBuffer(pkgBuffer, keyContent);

  const targetPkgPath = outputPath ? resolve(outputPath) : resolvedPkg;
  writeFileSync(targetPkgPath, result.signedPackageBuffer);

  if (detached) {
    const detachedPath = `${targetPkgPath}.sig`;
    writeFileSync(detachedPath, result.signatureBuffer);
  }

  return result;
}
