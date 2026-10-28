import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  unpackPackage,
  SecurityError,
  ValidationError,
  createPackageBuffer,
  NamespacedStorageProvider,
  QuotaExceededError,
  SecureKeyringProvider,
  NetworkProxyProvider,
  CapabilityBroker,
  createStorageCapabilityHandler,
  createKeyringCapabilityHandler,
  createNetworkCapabilityHandler,
  LocalPluginManager,
} from '../../packages/runtime/src/index.js';
import {
  IframeContainer,
  FORBIDDEN_SANDBOX_ATTRIBUTES,
  STRICT_SANDBOX_ATTRIBUTES,
} from '../../packages/ui-host/src/container/iframe-container.js';

describe('Security Boundary & Penetration Test Suite (TEST-002)', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'miyuna-security-test-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('Vector 1: Zip Slip & Path Traversal Attacks', () => {
    const maliciousPaths = [
      '../../evil.js',
      '..\\..\\evil.bat',
      'sub/../../escaped.txt',
      'sub\\..\\..\\escaped.txt',
      'folder/../../../var/www/malicious.php',
    ];

    for (const evilPath of maliciousPaths) {
      it(`blocks archive containing traversal path: '${evilPath}'`, () => {
        const files = [
          {
            path: 'plugin.json',
            content: JSON.stringify({
              id: 'org.miyunadev.exploit',
              name: 'Exploit Plugin',
              version: '1.0.0',
              artifact: { type: 'web-bundle', entry: 'dist/index.html' },
            }),
          },
          {
            path: evilPath,
            content: 'malicious payload',
          },
        ];

        const badZipBuffer = createPackageBuffer(files);
        const targetDir = join(tempDir, 'unpack-target');

        expect(() => {
          unpackPackage(badZipBuffer, targetDir);
        }).toThrow(SecurityError);

        // Verify targetDir does NOT contain the escaped file
        if (existsSync(targetDir)) {
          const filesOnDisk = readdirSync(targetDir);
          expect(filesOnDisk).not.toContain('evil.js');
          expect(filesOnDisk).not.toContain('evil.bat');
          expect(filesOnDisk).not.toContain('escaped.txt');
        }
      });
    }

    it('rejects manifest with unsafe relative artifact entry path', () => {
      const files = [
        {
          path: 'plugin.json',
          content: JSON.stringify({
            id: 'org.miyunadev.badentry',
            name: 'Bad Entry Plugin',
            version: '1.0.0',
            artifact: { type: 'web-bundle', entry: '../../outside/index.html' },
          }),
        },
        {
          path: 'dist/index.html',
          content: '<h1>test</h1>',
        },
      ];

      const badZipBuffer = createPackageBuffer(files);
      const targetDir = join(tempDir, 'bad-entry-target');

      expect(() => {
        unpackPackage(badZipBuffer, targetDir);
      }).toThrow(ValidationError);
    });
  });

  describe('Vector 2: Sandbox DOM Escape & Host Isolation', () => {
    it('generates sandbox attributes that strictly forbid allow-same-origin and allow-top-navigation', () => {
      const container = new IframeContainer({
        pluginId: 'org.miyunadev.sandboxprobe',
        sourceUrl: '/ext/org.miyunadev.sandboxprobe/dist/index.html',
      });

      const sandboxAttr = container.getSandboxAttributeString();
      const tokens = sandboxAttr.split(/\s+/);

      // Check all forbidden attributes are absent
      for (const forbidden of FORBIDDEN_SANDBOX_ATTRIBUTES) {
        expect(tokens).not.toContain(forbidden);
      }

      // Check mandatory strict attributes are present
      for (const mandatory of STRICT_SANDBOX_ATTRIBUTES) {
        expect(tokens).toContain(mandatory);
      }
    });

    it('enforces strict Content Security Policy disallowing object-src, frame-src, and unauthorized connections', () => {
      const container = new IframeContainer({
        pluginId: 'org.miyunadev.cspprobe',
        sourceUrl: '/ext/org.miyunadev.cspprobe/dist/index.html',
      });

      const csp = container.getContentSecurityPolicy();

      expect(csp).toContain("frame-src 'none'");
      expect(csp).toContain("object-src 'none'");
      expect(csp).toContain("base-uri 'none'");
      expect(csp).toContain("connect-src 'none'");
    });

    it('renders declarative iframe HTML safely escaping attribute injection attempts', () => {
      const maliciousId = 'org.miyunadev.injection" onerror="alert(1)" dummy="';
      const container = new IframeContainer({
        pluginId: maliciousId,
        sourceUrl: '/ext/evil/index.html',
        title: 'Exploit <script>alert("xss")</script>',
      });

      const html = container.renderHtml();
      expect(html).not.toContain('onerror="alert(1)"');
      expect(html).toContain('&quot;');
    });
  });

  describe('Vector 3: Master Auth Token Theft & Keyring Isolation', () => {
    let keyring: SecureKeyringProvider;
    let broker: CapabilityBroker;
    let manager: LocalPluginManager;

    beforeEach(() => {
      keyring = new SecureKeyringProvider();
      manager = new LocalPluginManager({ baseInstallDir: tempDir });
      broker = new CapabilityBroker(manager);
      broker.registerCapabilityHandler(createKeyringCapabilityHandler(keyring));
    });

    it('disallows reading raw secret values directly through broker JSON-RPC', async () => {
      // Install and activate plugin so permission checks pass
      const testPkg = createPackageBuffer([
        {
          path: 'plugin.json',
          content: JSON.stringify({
            id: 'org.miyunadev.client',
            name: 'Client Plugin',
            version: '1.0.0',
            artifact: { type: 'web-bundle', entry: 'dist/index.html' },
          }),
        },
        { path: 'dist/index.html', content: '<h1>test</h1>' },
      ]);
      await manager.install(testPkg);
      await manager.activate('org.miyunadev.client');
      manager.grantPermission('org.miyunadev.client', 'auth.secureKeyring', 'user');

      // Store secret for plugin
      await keyring.storeCredential('org.miyunadev.client', 'jellyfin_api_key', 'MY_SECRET_KEY_12345');

      // Attempt to read secret via broker
      const readAttempt = {
        jsonrpc: '2.0',
        id: 'theft-1',
        method: 'broker.invoke',
        params: {
          capability: 'auth.secureKeyring',
          action: 'getSecret',
          args: { key: 'jellyfin_api_key' },
        },
      };

      const res = await broker.handleRequest('org.miyunadev.client', readAttempt as any);
      expect(res.error).toBeDefined();
      expect(res.error?.message).toMatch(/(Unsupported keyring action|Direct secret readout)/i);
    });

    it('isolates credentials so plugin B cannot detect or access credentials of plugin A', async () => {
      await keyring.storeCredential('org.miyunadev.pluginA', 'auth_token', 'SECRET_A');

      // Plugin B checks if secret exists
      const hasForB = await keyring.hasCredential('org.miyunadev.pluginB', 'auth_token');
      expect(hasForB.exists).toBe(false);

      // Plugin B attempts to read secret via host api
      const readForB = await keyring.getSecretForHost('org.miyunadev.pluginB', 'auth_token');
      expect(readForB).toBeNull();

      // Plugin B attempts to delete secret belonging to Plugin A
      const deleted = await keyring.deleteCredential('org.miyunadev.pluginB', 'auth_token');
      expect(deleted).toBe(false);

      // Verify Plugin A secret is intact
      expect(await keyring.getSecretForHost('org.miyunadev.pluginA', 'auth_token')).toBe('SECRET_A');
    });
  });

  describe('Vector 4: Network SSRF, Local IP & Scheme Probing', () => {
    let network: NetworkProxyProvider;
    let keyring: SecureKeyringProvider;

    beforeEach(() => {
      keyring = new SecureKeyringProvider();
      network = new NetworkProxyProvider({ keyring });
      // Whitelist only specific public api
      network.setAllowedDomains('org.miyunadev.probe', ['api.jellyfin.org', '*.trusted-cdn.com']);
    });

    const forbiddenUrls = [
      'file:///etc/passwd',
      'file://C:/Windows/System32/drivers/etc/hosts',
      'data:text/html,<script>alert(1)</script>',
      'javascript:void(0)',
      'gopher://127.0.0.1:70/',
      'http://127.0.0.1:8080/admin',
      'http://localhost:3000/metrics',
      'http://10.0.0.1/internal-dashboard',
      'http://192.168.1.1/router-settings',
      'http://169.254.169.254/latest/meta-data/', // AWS EC2 metadata probe
      'http://malicious-exfiltration.com/steal',
    ];

    for (const url of forbiddenUrls) {
      it(`blocks SSRF / unauthorized probe to: '${url}'`, async () => {
        expect(async () => {
          await network.fetch('org.miyunadev.probe', { url });
        }).toThrow(/(Security Error|Disallowed protocol)/i);
      });
    }

    it('allows permitted request to whitelisted domain pattern', () => {
      expect(network.isDomainAllowed('org.miyunadev.probe', 'https://api.jellyfin.org/items')).toBe(true);
      expect(network.isDomainAllowed('org.miyunadev.probe', 'https://static.trusted-cdn.com/bundle.js')).toBe(true);
      expect(network.isDomainAllowed('org.miyunadev.probe', 'https://untrusted-site.com')).toBe(false);
    });
  });

  describe('Vector 5: Resource Exhaustion & Quota Enforcement', () => {
    it('prevents denial-of-service storage flooding by enforcing hard quotas', async () => {
      const storage = new NamespacedStorageProvider();
      const pluginId = 'org.miyunadev.flooder';
      storage.setPluginQuota(pluginId, 1024); // 1KB quota

      // 500 bytes ok
      await storage.setItem(pluginId, 'chunk1', 'x'.repeat(500));
      expect(await storage.getItem(pluginId, 'chunk1')).toHaveLength(500);

      // Exceeding 1024 bytes must throw QuotaExceededError
      expect(async () => {
        await storage.setItem(pluginId, 'chunk2', 'x'.repeat(600));
      }).toThrow(QuotaExceededError);

      // Previous data remains intact
      expect(await storage.getItem(pluginId, 'chunk1')).toHaveLength(500);
      expect(await storage.getItem(pluginId, 'chunk2')).toBeNull();
    });
  });
});
