/**
 * @file index.ts
 * Main entry point for @miyuna/plugin-cli.
 */

export * from './crypto/ed25519.js';
export * from './commands/keygen.js';
export * from './commands/sign.js';
export * from './commands/verify.js';
export * from './commands/pack.js';

import { signCommand } from './commands/sign.js';
import { verifyCommand } from './commands/verify.js';
import { keygenCommand } from './commands/keygen.js';
import { packCommand } from './commands/pack.js';

export async function runCli(args: string[]): Promise<number> {
  const [command, ...rest] = args;

  function getArg(flag: string): string | undefined {
    const idx = rest.indexOf(flag);
    return idx !== -1 && idx + 1 < rest.length ? rest[idx + 1] : undefined;
  }

  function hasFlag(flag: string): boolean {
    return rest.includes(flag);
  }

  try {
    switch (command) {
      case 'keygen': {
        const outDir = getArg('--out-dir') || getArg('-o');
        const prefix = getArg('--prefix') || 'miyuna-publisher';
        const res = keygenCommand({ outDir, prefix });
        console.log(`Generated Ed25519 publisher keypair:`);
        console.log(`  Private Key: ${res.privateKeyPath}`);
        console.log(`  Public Key:  ${res.publicKeyPath}`);
        console.log(`  Public Key Hex: ${res.keyPair.publicKeyHex}`);
        return 0;
      }

      case 'pack': {
        const sourceDir = rest[0] && !rest[0].startsWith('-') ? rest[0] : '.';
        const out = getArg('--out') || getArg('-o');
        const key = getArg('--key') || getArg('-k');
        const res = packCommand({ sourceDir, outputPath: out, privateKeyPath: key });
        console.log(`Packed archive successfully: ${res.outputPath} (Signed: ${res.signed})`);
        return 0;
      }

      case 'sign': {
        const pkg = rest[0] && !rest[0].startsWith('-') ? rest[0] : undefined;
        const key = getArg('--key') || getArg('-k');
        const out = getArg('--out') || getArg('-o');
        const detached = hasFlag('--detached');

        if (!pkg || !key) {
          console.error('Usage: miyuna-plugin sign <package.mpk> --key <priv.key> [--out <output.mpk>] [--detached]');
          return 1;
        }

        const res = await signCommand(pkg, key, out, detached);
        console.log(`Signed package successfully!`);
        console.log(`Signature (hex): ${res.signatureHex.slice(0, 32)}...`);
        return 0;
      }

      case 'verify': {
        const pkg = rest[0] && !rest[0].startsWith('-') ? rest[0] : undefined;
        const pubKey = getArg('--public-key') || getArg('-p');
        const sig = getArg('--signature') || getArg('-s');

        if (!pkg) {
          console.error('Usage: miyuna-plugin verify <package.mpk> [--public-key <pub.key>] [--signature <detached.sig>]');
          return 1;
        }

        const res = await verifyCommand(pkg, pubKey, sig);
        if (res.valid) {
          console.log(`Verification SUCCESS: ${res.manifest?.id}@${res.manifest?.version}`);
          console.log(`  Files verified: ${res.filesCount}`);
          console.log(`  Checksums valid: ${res.checksumsMatch}`);
          console.log(`  Signature verified: ${res.signatureVerified}`);
          return 0;
        } else {
          console.error(`Verification FAILED: ${res.error}`);
          return 1;
        }
      }

      default:
        console.log(`Miyuna Plugin CLI (v1.0.0)`);
        console.log(`Commands:`);
        console.log(`  keygen                    Generate an Ed25519 keypair`);
        console.log(`  pack <dir>                Pack a directory into an .mpk archive`);
        console.log(`  sign <pkg.mpk> --key <k>  Sign a package archive`);
        console.log(`  verify <pkg.mpk>          Verify integrity and publisher signature`);
        return 0;
    }
  } catch (err: any) {
    console.error(`Error: ${err.message}`);
    return 1;
  }
}
