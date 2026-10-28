import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { generateKeyPair } from '../src/crypto/ed25519.js';
import { signPackageBuffer, signCommand } from '../src/commands/sign.js';
import { verifyPackageBuffer, verifyCommand } from '../src/commands/verify.js';
import { packCommand } from '../src/commands/pack.js';
import { keygenCommand } from '../src/commands/keygen.js';
import { runCli } from '../src/index.js';
import { unpackPackage } from '../../runtime/src/installer/unpacker.js';

describe('Ed25519 Package Signing and Verification Tooling (REG-002)', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'miyuna-cli-test-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  function createSamplePluginSource(): string {
    const srcDir = join(tempDir, 'sample-plugin');
    const { mkdirSync } = require('node:fs');
    mkdirSync(join(srcDir, 'dist'), { recursive: true });

    const manifest = {
      $schema: 'https://miyunadev.org/schemas/v1/plugin.schema.json',
      id: 'org.miyunadev.testplugin',
      name: 'Test Plugin',
      version: '1.0.0',
      description: 'A test plugin for cryptographic verification',
      author: { name: 'Miyuna Team' },
      license: 'MIT',
      engines: { miyuna: '>=1.0.0' },
      artifact: {
        type: 'web-bundle',
        entry: 'dist/index.html',
      },
      contributions: [
        {
          type: 'route',
          id: 'test-route',
          title: 'Test',
          path: '/test',
        },
      ],
      capabilities: [],
    };

    writeFileSync(join(srcDir, 'plugin.json'), JSON.stringify(manifest, null, 2));
    writeFileSync(join(srcDir, 'dist', 'index.html'), '<html><body>Hello World</body></html>');
    writeFileSync(join(srcDir, 'dist', 'bundle.js'), 'console.log("running plugin");');

    return srcDir;
  }

  it('generates Ed25519 publisher keypair and saves to disk', () => {
    const keygenRes = keygenCommand({ outDir: tempDir, prefix: 'publisher' });

    expect(existsSync(keygenRes.privateKeyPath)).toBe(true);
    expect(existsSync(keygenRes.publicKeyPath)).toBe(true);
    expect(keygenRes.keyPair.publicKeyPem).toContain('BEGIN PUBLIC KEY');
    expect(keygenRes.keyPair.privateKeyPem).toContain('BEGIN PRIVATE KEY');
    expect(keygenRes.keyPair.publicKeyHex).toHaveLength(64);
  });

  it('packs a plugin directory, signs it with publisher key, and verifies successfully', () => {
    const srcDir = createSamplePluginSource();
    const keyPair = generateKeyPair();

    const privKeyPath = join(tempDir, 'test.priv.pem');
    const pubKeyPath = join(tempDir, 'test.pub.pem');
    writeFileSync(privKeyPath, keyPair.privateKeyPem);
    writeFileSync(pubKeyPath, keyPair.publicKeyPem);

    const outMpk = join(tempDir, 'output.mpk');

    // 1. Pack with signing
    const packRes = packCommand({
      sourceDir: srcDir,
      outputPath: outMpk,
      privateKeyPath: privKeyPath,
    });

    expect(packRes.signed).toBe(true);
    expect(existsSync(outMpk)).toBe(true);

    // 2. Verify with public key
    const verifyRes = verifyPackageBuffer(packRes.packageBuffer, keyPair.publicKeyPem);

    expect(verifyRes.valid).toBe(true);
    expect(verifyRes.hasChecksums).toBe(true);
    expect(verifyRes.checksumsMatch).toBe(true);
    expect(verifyRes.hasSignature).toBe(true);
    expect(verifyRes.signatureVerified).toBe(true);
    expect(verifyRes.manifest?.id).toBe('org.miyunadev.testplugin');
    expect(verifyRes.manifest?.version).toBe('1.0.0');
  });

  it('fails verification when package files are tampered', () => {
    const srcDir = createSamplePluginSource();
    const keyPair = generateKeyPair();

    const privKeyPath = join(tempDir, 'test.priv.pem');
    writeFileSync(privKeyPath, keyPair.privateKeyPem);

    const outMpk = join(tempDir, 'tamper-test.mpk');
    const packRes = packCommand({
      sourceDir: srcDir,
      outputPath: outMpk,
      privateKeyPath: privKeyPath,
    });

    // Tamper with bytes inside the compressed archive payload
    const tamperedBuffer = Buffer.from(packRes.packageBuffer);
    // Find the offset where local file data starts (after first local file header) and flip bytes
    const dataOffset = 30 + 'plugin.json'.length + 5;
    tamperedBuffer[dataOffset] = tamperedBuffer[dataOffset] ^ 0xff;

    const verifyRes = verifyPackageBuffer(tamperedBuffer, keyPair.publicKeyPem);
    expect(verifyRes.valid).toBe(false);
  });

  it('fails verification when signature is signed by an untrusted/different key', () => {
    const srcDir = createSamplePluginSource();
    const legitimateKey = generateKeyPair();
    const attackerKey = generateKeyPair();

    const legitPrivPath = join(tempDir, 'legit.priv.pem');
    writeFileSync(legitPrivPath, legitimateKey.privateKeyPem);

    const outMpk = join(tempDir, 'signed.mpk');
    const packRes = packCommand({
      sourceDir: srcDir,
      outputPath: outMpk,
      privateKeyPath: legitPrivPath,
    });

    // Verify against attacker's public key (untrusted)
    const verifyRes = verifyPackageBuffer(packRes.packageBuffer, attackerKey.publicKeyPem);
    expect(verifyRes.valid).toBe(false);
    expect(verifyRes.error).toContain('signature verification failed');
  });

  it('enforces signature check in runtime unpackPackage installer', () => {
    const srcDir = createSamplePluginSource();
    const keyPair = generateKeyPair();
    const wrongKey = generateKeyPair();

    const privKeyPath = join(tempDir, 'test.priv.pem');
    writeFileSync(privKeyPath, keyPair.privateKeyPem);

    const outMpk = join(tempDir, 'runtime-install.mpk');
    const packRes = packCommand({
      sourceDir: srcDir,
      outputPath: outMpk,
      privateKeyPath: privKeyPath,
    });

    const installDest = join(tempDir, 'installed');

    // 1. Unpack with legitimate public key -> SUCCESS
    const unpackRes = unpackPackage(packRes.packageBuffer, installDest, {
      publicKey: keyPair.publicKeyPem,
    });
    expect(unpackRes.checksumsVerified).toBe(true);
    expect(unpackRes.signatureVerified).toBe(true);
    expect(existsSync(join(installDest, 'dist', 'index.html'))).toBe(true);

    // 2. Unpack with wrong public key -> THROWS IntegrityError
    const installDestFail = join(tempDir, 'installed-fail');
    expect(() => {
      unpackPackage(packRes.packageBuffer, installDestFail, {
        publicKey: wrongKey.publicKeyPem,
      });
    }).toThrow(/signature verification failed/i);
  });

  it('executes CLI commands end-to-end (keygen, pack, sign, verify)', async () => {
    const srcDir = createSamplePluginSource();

    // 1. Keygen CLI
    const keygenCode = await runCli(['keygen', '--out-dir', tempDir, '--prefix', 'cli-key']);
    expect(keygenCode).toBe(0);

    const privKeyPath = join(tempDir, 'cli-key.priv.pem');
    const pubKeyPath = join(tempDir, 'cli-key.pub.pem');
    expect(existsSync(privKeyPath)).toBe(true);
    expect(existsSync(pubKeyPath)).toBe(true);

    // 2. Pack CLI (unsigned)
    const unsignedMpk = join(tempDir, 'unsigned.mpk');
    const packCode = await runCli(['pack', srcDir, '--out', unsignedMpk]);
    expect(packCode).toBe(0);
    expect(existsSync(unsignedMpk)).toBe(true);

    // 3. Sign CLI
    const signedMpk = join(tempDir, 'signed-by-cli.mpk');
    const signCode = await runCli(['sign', unsignedMpk, '--key', privKeyPath, '--out', signedMpk]);
    expect(signCode).toBe(0);
    expect(existsSync(signedMpk)).toBe(true);

    // 4. Verify CLI
    const verifyCode = await runCli(['verify', signedMpk, '--public-key', pubKeyPath]);
    expect(verifyCode).toBe(0);
  });
});
