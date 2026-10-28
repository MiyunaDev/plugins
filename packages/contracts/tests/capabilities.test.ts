import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  STANDARD_CAPABILITIES,
  isStandardCapability,
  parseQuotaStringToBytes,
} from '../src/capabilities.js';

describe('Standard Capabilities & Permissions Catalog', () => {
  describe('Standard Capabilities Taxonomy', () => {
    test('standard capability identifiers are defined', () => {
      assert.equal(STANDARD_CAPABILITIES.STORAGE_LOCAL, 'storage.local');
      assert.equal(STANDARD_CAPABILITIES.NETWORK_FETCH, 'network.fetch');
      assert.equal(STANDARD_CAPABILITIES.DEVICE_NAVIAH_SYNC, 'device.naviah-sync');
      assert.equal(STANDARD_CAPABILITIES.AUTH_SECURE_KEYRING, 'auth.secureKeyring');
      assert.equal(STANDARD_CAPABILITIES.UI_CANVAS, 'ui.canvas');
      assert.equal(STANDARD_CAPABILITIES.CLIPBOARD_READ, 'clipboard.read');
      assert.equal(STANDARD_CAPABILITIES.CLIPBOARD_WRITE, 'clipboard.write');
      assert.equal(STANDARD_CAPABILITIES.EVENT_BUS, 'event.bus');
    });

    test('isStandardCapability validates standard names', () => {
      assert.equal(isStandardCapability('storage.local'), true);
      assert.equal(isStandardCapability('device.naviah-sync'), true);
      assert.equal(isStandardCapability('network.fetch'), true);
      assert.equal(isStandardCapability('arbitrary.nonexistent.cap'), false);
    });
  });

  describe('parseQuotaStringToBytes', () => {
    test('parses KB, MB, GB strings correctly', () => {
      assert.equal(parseQuotaStringToBytes('512KB'), 512 * 1024);
      assert.equal(parseQuotaStringToBytes('10MB'), 10 * 1024 * 1024);
      assert.equal(parseQuotaStringToBytes('2GB'), 2 * 1024 * 1024 * 1024);
    });

    test('defaults to 10MB when undefined or invalid', () => {
      assert.equal(parseQuotaStringToBytes(undefined), 10 * 1024 * 1024);
      assert.equal(parseQuotaStringToBytes('invalid-string'), 10 * 1024 * 1024);
      assert.equal(parseQuotaStringToBytes(''), 10 * 1024 * 1024);
    });
  });
});
