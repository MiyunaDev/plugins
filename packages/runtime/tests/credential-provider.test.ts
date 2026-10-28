import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  SecureKeyringProvider,
  createKeyringCapabilityHandler,
} from '../src/providers/credential-provider.js';

describe('Secure Keyring Provider & Credential Isolation', () => {
  test('stores credentials and allows checking existence without leaking secret', async () => {
    const keyring = new SecureKeyringProvider();
    const pluginId = 'org.miyunadev.plugins.jellyfin';

    const storeRes = await keyring.storeCredential(pluginId, 'auth_token', 'secret-token-12345', {
      serverUrl: 'http://127.0.0.1:8096',
    });
    assert.equal(storeRes.success, true);
    assert.equal(storeRes.credentialId, 'auth_token');

    // hasCredential returns metadata but NEVER the secret
    const status = await keyring.hasCredential(pluginId, 'auth_token');
    assert.equal(status.exists, true);
    assert.equal((status as any).secret, undefined);
    assert.equal(status.metadata?.serverUrl, 'http://127.0.0.1:8096');

    // listCredentials returns list without secrets
    const list = await keyring.listCredentials(pluginId);
    assert.equal(list.length, 1);
    assert.equal(list[0].credentialId, 'auth_token');
    assert.equal((list[0] as any).secret, undefined);
  });

  test('strictly isolates credentials between different plugins', async () => {
    const keyring = new SecureKeyringProvider();
    const pluginA = 'org.plugin.a';
    const pluginB = 'org.plugin.b';

    await keyring.storeCredential(pluginA, 'token', 'secretA');
    await keyring.storeCredential(pluginB, 'token', 'secretB');

    assert.equal(await keyring.getSecretForHost(pluginA, 'token'), 'secretA');
    assert.equal(await keyring.getSecretForHost(pluginB, 'token'), 'secretB');

    // Plugin A cannot check Plugin B credentials
    const bStatusFromA = await keyring.hasCredential(pluginA, 'tokenB');
    assert.equal(bStatusFromA.exists, false);

    // Deleting Plugin A credentials does not delete Plugin B
    await keyring.deleteCredential(pluginA, 'token');
    assert.equal((await keyring.hasCredential(pluginA, 'token')).exists, false);
    assert.equal((await keyring.hasCredential(pluginB, 'token')).exists, true);
  });

  test('capability handler disallows direct secret readout through broker', async () => {
    const keyring = new SecureKeyringProvider();
    const handler = createKeyringCapabilityHandler(keyring);
    const pluginId = 'org.test.plugin';

    await keyring.storeCredential(pluginId, 'mySecret', 'super-confidential-token');

    // The capability handler must only support safe operations
    assert.deepEqual(handler.supportedActions?.sort(), [
      'deleteCredential',
      'hasCredential',
      'listCredentials',
      'storeCredential',
    ]);

    // Attempting to invoke an unexposed getSecret action fails
    await assert.rejects(
      async () => {
        await handler.handle('getSecret', { credentialId: 'mySecret' }, pluginId);
      },
      (err: any) => err.message.includes('Unsupported keyring action')
    );
  });
});
