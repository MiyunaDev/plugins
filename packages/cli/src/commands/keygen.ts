/**
 * @file keygen.ts
 * Generates an Ed25519 publisher keypair and saves it to disk.
 */

import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { generateKeyPair, GeneratedKeyPair } from '../crypto/ed25519.js';

export interface KeygenOptions {
  outDir?: string;
  prefix?: string;
}

export function keygenCommand(options: KeygenOptions = {}): {
  keyPair: GeneratedKeyPair;
  privateKeyPath: string;
  publicKeyPath: string;
} {
  const targetDir = resolve(options.outDir || process.cwd());
  const prefix = options.prefix || 'miyuna-publisher';

  if (!existsSync(targetDir)) {
    mkdirSync(targetDir, { recursive: true });
  }

  const keyPair = generateKeyPair();

  const privateKeyPath = join(targetDir, `${prefix}.priv.pem`);
  const publicKeyPath = join(targetDir, `${prefix}.pub.pem`);

  writeFileSync(privateKeyPath, keyPair.privateKeyPem, { mode: 0o600 });
  writeFileSync(publicKeyPath, keyPair.publicKeyPem, { mode: 0o644 });

  return {
    keyPair,
    privateKeyPath,
    publicKeyPath,
  };
}
