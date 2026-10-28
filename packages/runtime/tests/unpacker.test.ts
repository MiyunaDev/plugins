import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPackageBuffer } from '../src/installer/packer.js';
import { unpackPackage, SecurityError, IntegrityError, ValidationError } from '../src/installer/unpacker.js';

describe('Package Unpacker & Security Isolation', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'miyuna-unpack-test-'));
  });

  afterEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('unpacks valid .mpk package and verifies checksums', () => {
    const manifest = {
      $schema: 'https://specs.miyunadev.org/schemas/v1/plugin.schema.json',
      id: 'org.miyunadev.demo.unpacker',
      name: 'Unpack Test Plugin',
      version: '1.0.0',
      engines: { miyuna: '>=1.0.0' },
      artifact: { type: 'web-bundle', entry: 'dist/index.html' },
      author: { name: 'Tester' },
    };

    const pkgBuf = createPackageBuffer([
      { path: 'plugin.json', content: JSON.stringify(manifest, null, 2) },
      { path: 'dist/index.html', content: '<h1>Hello World</h1>' },
      { path: 'assets/icon.png', content: 'dummy-png-bytes' },
    ]);

    const result = unpackPackage(pkgBuf, tempDir);

    assert.equal(result.manifest.id, 'org.miyunadev.demo.unpacker');
    assert.equal(result.checksumsVerified, true);
    assert.equal(existsSync(join(tempDir, 'plugin.json')), true);
    assert.equal(existsSync(join(tempDir, 'dist', 'index.html')), true);
    assert.equal(readFileSync(join(tempDir, 'dist', 'index.html'), 'utf-8'), '<h1>Hello World</h1>');
  });

  test('aborts and throws SecurityError when encountering Zip Slip path traversal', () => {
    const manifest = {
      id: 'org.miyunadev.malicious',
      name: 'Zip Slip Plugin',
      version: '1.0.0',
      engines: { miyuna: '>=1.0.0' },
      artifact: { type: 'web-bundle', entry: 'index.html' },
      author: { name: 'Attacker' },
    };

    // Construct package containing a file with '../' traversal
    const maliciousPkgBuf = createPackageBuffer([
      { path: 'plugin.json', content: JSON.stringify(manifest) },
      { path: '../../evil.js', content: 'console.log("hacked");' },
    ]);

    assert.throws(
      () => unpackPackage(maliciousPkgBuf, tempDir),
      (err: any) => err instanceof SecurityError && err.message.includes('Zip Slip')
    );
  });

  test('detects tampered content and throws IntegrityError when checksum mismatches', () => {
    const manifest = {
      id: 'org.miyunadev.tampered',
      name: 'Tampered Plugin',
      version: '1.0.0',
      engines: { miyuna: '>=1.0.0' },
      artifact: { type: 'web-bundle', entry: 'main.js' },
      author: { name: 'Tester' },
    };

    // Provide a forged checksums.json that does not match main.js
    const pkgBuf = createPackageBuffer([
      { path: 'plugin.json', content: JSON.stringify(manifest) },
      { path: 'main.js', content: 'console.log("legitimate code");' },
      {
        path: 'checksums.json',
        content: JSON.stringify({
          'plugin.json': 'fake-hash',
          'main.js': '0000000000000000000000000000000000000000000000000000000000000000',
        }),
      },
    ]);

    assert.throws(
      () => unpackPackage(pkgBuf, tempDir),
      (err: any) => err instanceof IntegrityError && err.message.includes('Integrity check failed')
    );
  });

  test('rejects package missing mandatory plugin.json', () => {
    const pkgBuf = createPackageBuffer([
      { path: 'index.html', content: '<h1>No Manifest</h1>' },
    ]);

    assert.throws(
      () => unpackPackage(pkgBuf, tempDir),
      (err: any) => err instanceof ValidationError && err.message.includes("missing mandatory 'plugin.json'")
    );
  });
});
