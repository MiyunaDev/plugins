/**
 * @file index.ts
 * Main entry point for @miyuna/plugin-registry-service.
 */

export * from './storage/store.js';
export * from './engine/semver.js';
export * from './server.js';
export * from './client.js';

import { RegistryServer } from './server.js';

if (import.meta.main) {
  const port = parseInt(process.env.PORT || '3030', 10);
  const host = process.env.HOST || '0.0.0.0';
  const storageDir = process.env.STORAGE_DIR || './data/packages';

  const server = new RegistryServer({ port, host, storageDir });
  server.start().then((actualPort) => {
    console.log(`Miyuna Plugin Registry listening on http://${host}:${actualPort}`);
  }).catch((err) => {
    console.error('Failed to start registry service:', err);
    process.exit(1);
  });
}
