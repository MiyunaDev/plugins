/**
 * @file harness.ts
 * Standard test packages and fixtures generator for conformance testing.
 */

import { createPackageBuffer } from '../../runtime/src/installer/packer.js';

export function createStandardConformancePackage(options: {
  id?: string;
  version?: string;
  quota?: string;
  domains?: string[];
} = {}): Buffer {
  const pluginId = options.id || 'org.miyunadev.conformance';
  const version = options.version || '1.0.0';

  const manifest = {
    $schema: 'https://miyunadev.org/schemas/v1/plugin.schema.json',
    id: pluginId,
    name: 'Conformance Test Plugin',
    version,
    description: 'Standardized test plugin for host adapter compliance verification',
    author: { name: 'Miyuna Conformance Harness' },
    license: 'MIT',
    engines: { miyuna: '>=1.0.0', client: { web: true, android: true, ios: true } },
    artifact: {
      type: 'web-bundle',
      entry: 'dist/index.html',
    },
    contributions: [
      {
        type: 'route',
        id: 'test-dashboard',
        title: 'Conformance Dashboard',
        path: '/dashboard',
      },
    ],
    capabilities: [
      {
        name: 'storage.local',
        reason: 'Store test states',
        quota: options.quota || '5MB',
      },
      {
        name: 'network.fetch',
        reason: 'API tests',
        domains: options.domains || ['api.example.com'],
      },
    ],
  };

  const files = [
    {
      path: 'plugin.json',
      content: JSON.stringify(manifest, null, 2),
    },
    {
      path: 'dist/index.html',
      content: '<!DOCTYPE html><html><body><h1>Conformance Harness</h1></body></html>',
    },
    {
      path: 'dist/main.js',
      content: 'console.log("conformance running");',
    },
  ];

  return createPackageBuffer(files);
}
