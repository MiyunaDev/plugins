import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  isValidPluginId,
  isValidSemver,
  isSafeRelativePath,
  PluginManifest,
} from '../src/manifest.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const fixturesDir = resolve(__dirname, '../../../tests/fixtures/manifests');

describe('Plugin Manifest Contract & Validation', () => {
  describe('isValidPluginId', () => {
    test('accepts valid reverse-domain IDs', () => {
      assert.equal(isValidPluginId('org.miyunadev.test'), true);
      assert.equal(isValidPluginId('com.example.jellyfin-connector'), true);
      assert.equal(isValidPluginId('org.miyunadev.retro_runner_123'), true);
    });

    test('rejects invalid IDs', () => {
      assert.equal(isValidPluginId('invalid id with spaces'), false);
      assert.equal(isValidPluginId('Uppercase.Not.Allowed'), false);
      assert.equal(isValidPluginId('singleword'), false);
      assert.equal(isValidPluginId('.starts.with.dot'), false);
      assert.equal(isValidPluginId('ends.with.dot.'), false);
      assert.equal(isValidPluginId(''), false);
    });
  });

  describe('isValidSemver', () => {
    test('accepts valid semver strings', () => {
      assert.equal(isValidSemver('1.0.0'), true);
      assert.equal(isValidSemver('0.1.0-alpha.1'), true);
      assert.equal(isValidSemver('2.3.4+build.2026'), true);
      assert.equal(isValidSemver('1.2.0-beta.1+exp.sha.5114f85'), true);
    });

    test('rejects invalid semver strings', () => {
      assert.equal(isValidSemver('v1.0.0'), false);
      assert.equal(isValidSemver('1.0'), false);
      assert.equal(isValidSemver('1.0.0.0'), false);
      assert.equal(isValidSemver('not-a-version'), false);
      assert.equal(isValidSemver(''), false);
    });
  });

  describe('isSafeRelativePath', () => {
    test('accepts safe relative paths', () => {
      assert.equal(isSafeRelativePath('dist/index.html'), true);
      assert.equal(isSafeRelativePath('assets/icon.png'), true);
      assert.equal(isSafeRelativePath('main.js'), true);
    });

    test('rejects path traversal and absolute paths', () => {
      assert.equal(isSafeRelativePath('../../etc/passwd'), false);
      assert.equal(isSafeRelativePath('../root.js'), false);
      assert.equal(isSafeRelativePath('/absolute/path.js'), false);
      assert.equal(isSafeRelativePath('\\windows\\path.js'), false);
      assert.equal(isSafeRelativePath(''), false);
    });
  });

  describe('Manifest Test Fixtures', () => {
    test('all valid manifest fixtures pass structural validation', () => {
      const validFiles = ['valid-minimal.json', 'valid-full-jellyfin.json', 'valid-mini-game.json'];

      for (const file of validFiles) {
        const content = readFileSync(resolve(fixturesDir, file), 'utf-8');
        const manifest: PluginManifest = JSON.parse(content);

        assert.ok(manifest.id, `${file} missing id`);
        assert.ok(isValidPluginId(manifest.id), `${file} id is invalid: ${manifest.id}`);
        assert.ok(isValidSemver(manifest.version), `${file} semver is invalid: ${manifest.version}`);
        assert.ok(manifest.artifact, `${file} missing artifact`);
        assert.ok(isSafeRelativePath(manifest.artifact.entry), `${file} unsafe entry: ${manifest.artifact.entry}`);
        assert.ok(manifest.engines, `${file} missing engines`);
        assert.ok(manifest.engines.miyuna, `${file} missing engines.miyuna`);
      }
    });

    test('invalid-bad-id fixture triggers ID validation failure', () => {
      const content = readFileSync(resolve(fixturesDir, 'invalid-bad-id.json'), 'utf-8');
      const manifest: PluginManifest = JSON.parse(content);
      assert.equal(isValidPluginId(manifest.id), false);
    });

    test('invalid-bad-version fixture triggers SemVer validation failure', () => {
      const content = readFileSync(resolve(fixturesDir, 'invalid-bad-version.json'), 'utf-8');
      const manifest: PluginManifest = JSON.parse(content);
      assert.equal(isValidSemver(manifest.version), false);
    });

    test('invalid-zip-slip-entry fixture triggers safe path failure', () => {
      const content = readFileSync(resolve(fixturesDir, 'invalid-zip-slip-entry.json'), 'utf-8');
      const manifest: PluginManifest = JSON.parse(content);
      assert.equal(isSafeRelativePath(manifest.artifact.entry), false);
    });
  });
});
