import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, Server } from 'node:http';
import {
  NetworkProxyProvider,
  NetworkSecurityError,
  createNetworkCapabilityHandler,
} from '../src/providers/network-provider.js';
import { SecureKeyringProvider } from '../src/providers/credential-provider.js';

describe('Network Proxy Provider & Domain Whitelisting', () => {
  let server: Server;
  let serverPort: number;
  let serverUrl: string;

  before(async () => {
    server = createServer((req, res) => {
      // Echo auth header if present
      const receivedToken = req.headers['x-emby-token'] || req.headers['authorization'];
      if (req.url === '/ping') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ message: 'pong', token: receivedToken }));
      } else if (req.url === '/slow') {
        setTimeout(() => {
          res.writeHead(200);
          res.end('slow response');
        }, 150);
      } else {
        res.writeHead(404);
        res.end('not found');
      }
    });

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        serverPort = (server.address() as any).port;
        serverUrl = `http://127.0.0.1:${serverPort}`;
        resolve();
      });
    });
  });

  after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  test('permits requests to whitelisted domains and blocks non-whitelisted domains', async () => {
    const provider = new NetworkProxyProvider();
    const pluginId = 'org.test.plugin';

    // Allow only 127.0.0.1 (our test server)
    provider.setAllowedDomains(pluginId, [`127.0.0.1:${serverPort}`]);

    // Allowed request
    const allowedRes = await provider.fetch(pluginId, {
      url: `${serverUrl}/ping`,
      method: 'GET',
    });
    assert.equal(allowedRes.status, 200);
    assert.ok(allowedRes.body.includes('pong'));

    // Blocked request to different domain
    await assert.rejects(
      async () => {
        await provider.fetch(pluginId, { url: 'https://evil.attacker.com/leak' });
      },
      (err: any) => err instanceof NetworkSecurityError && err.message.includes('not authorized')
    );
  });

  test('matches wildcard domain patterns (*.example.com)', () => {
    const provider = new NetworkProxyProvider();
    const pluginId = 'org.wildcard.plugin';

    provider.setAllowedDomains(pluginId, ['*.jellyfin.org']);

    assert.equal(provider.isDomainAllowed(pluginId, 'https://api.jellyfin.org/test'), true);
    assert.equal(provider.isDomainAllowed(pluginId, 'https://sub.api.jellyfin.org/test'), true);
    assert.equal(provider.isDomainAllowed(pluginId, 'https://notjellyfin.org/test'), false);
  });

  test('rejects non-HTTP protocols (file:, data:, javascript:)', async () => {
    const provider = new NetworkProxyProvider();
    const pluginId = 'org.proto.plugin';
    provider.setAllowedDomains(pluginId, ['*']);

    await assert.rejects(
      async () => {
        await provider.fetch(pluginId, { url: 'file:///etc/passwd' });
      },
      (err: any) => err instanceof NetworkSecurityError && err.message.includes('Disallowed protocol')
    );
  });

  test('injects host credentials securely into outbound request', async () => {
    const keyring = new SecureKeyringProvider();
    const provider = new NetworkProxyProvider({ keyring });
    const pluginId = 'org.auth.plugin';

    provider.setAllowedDomains(pluginId, ['*']);
    await keyring.storeCredential(pluginId, 'my_api_key', 'injected-secret-key-999');

    const res = await provider.fetch(pluginId, {
      url: `${serverUrl}/ping`,
      method: 'GET',
      credentialId: 'my_api_key',
      credentialHeader: 'X-Emby-Token',
    });

    assert.equal(res.status, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.token, 'injected-secret-key-999');
  });

  test('enforces network request timeouts', async () => {
    const provider = new NetworkProxyProvider({ defaultTimeoutMs: 50 });
    const pluginId = 'org.timeout.plugin';
    provider.setAllowedDomains(pluginId, ['*']);

    await assert.rejects(
      async () => {
        await provider.fetch(pluginId, { url: `${serverUrl}/slow` });
      },
      (err: any) => err.message.includes('timed out')
    );
  });
});
