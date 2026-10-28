/**
 * @file pack.ts
 * Packs a plugin directory into a standard .mpk archive.
 */

import { readdirSync, statSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join, relative } from 'node:path';
import { createPackageBuffer, PackageFileEntry } from '../../../runtime/src/installer/packer.js';
import { signPackageBuffer } from './sign.js';

export interface PackOptions {
  sourceDir: string;
  outputPath?: string;
  privateKeyPath?: string;
}

export function collectFilesRecursively(dir: string, baseDir: string = dir): PackageFileEntry[] {
  const entries: PackageFileEntry[] = [];
  const items = readdirSync(dir);

  for (const item of items) {
    const fullPath = join(dir, item);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      if (item === 'node_modules' || item === '.git') continue;
      entries.push(...collectFilesRecursively(fullPath, baseDir));
    } else if (stat.isFile()) {
      const relPath = relative(baseDir, fullPath).replace(/\\/g, '/');
      entries.push({
        path: relPath,
        content: readFileSync(fullPath),
      });
    }
  }

  return entries;
}

export function packCommand(options: PackOptions): {
  outputPath: string;
  packageBuffer: Buffer;
  signed: boolean;
} {
  const resolvedSource = resolve(options.sourceDir);
  const files = collectFilesRecursively(resolvedSource);

  const manifestEntry = files.find((f) => f.path === 'plugin.json');
  if (!manifestEntry) {
    throw new Error(`Cannot pack '${resolvedSource}': missing 'plugin.json' manifest`);
  }

  const manifest = JSON.parse(manifestEntry.content.toString('utf-8'));
  const pluginId = manifest.id || 'unnamed-plugin';
  const version = manifest.version || '0.0.0';

  const defaultOutName = `${pluginId}-${version}.mpk`;
  const resolvedOut = options.outputPath ? resolve(options.outputPath) : resolve(process.cwd(), defaultOutName);

  let packageBuffer = createPackageBuffer(files);
  let signed = false;

  if (options.privateKeyPath) {
    const keyContent = readFileSync(resolve(options.privateKeyPath), 'utf-8');
    const signResult = signPackageBuffer(packageBuffer, keyContent);
    packageBuffer = signResult.signedPackageBuffer;
    signed = true;
  }

  writeFileSync(resolvedOut, packageBuffer);

  return {
    outputPath: resolvedOut,
    packageBuffer,
    signed,
  };
}
