/**
 * @file server.ts
 * Standalone Reference Registry HTTP Service implementation for Miyuna Plugins.
 */

import { createServer, IncomingMessage, ServerResponse, Server } from 'node:http';
import { URL } from 'node:url';
import { RegistryStore } from './storage/store.js';
import { verifyPackageBuffer } from '../../../packages/cli/src/commands/verify.js';

export interface RegistryServerOptions {
  port?: number;
  host?: string;
  store?: RegistryStore;
  storageDir?: string;
}

export class RegistryServer {
  public server: Server;
  public store: RegistryStore;
  public port: number;
  public host: string;
  private startTime = Date.now();

  constructor(options: RegistryServerOptions = {}) {
    this.port = options.port || 3030;
    this.host = options.host || '127.0.0.1';
    this.store = options.store || new RegistryStore(options.storageDir);

    this.server = createServer((req, res) => {
      this.handleRequest(req, res).catch((err) => {
        this.sendJson(res, 500, {
          error: 'INTERNAL_SERVER_ERROR',
          message: err.message || 'An unexpected error occurred',
        });
      });
    });
  }

  public async start(): Promise<number> {
    return new Promise((resolve) => {
      this.server.listen(this.port, this.host, () => {
        const addr = this.server.address();
        const actualPort = typeof addr === 'object' && addr ? addr.port : this.port;
        this.port = actualPort;
        resolve(actualPort);
      });
    });
  }

  public async stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server.close((err) => (err ? reject(err) : resolve()));
    });
  }

  private sendJson(res: ServerResponse, statusCode: number, data: any) {
    const payload = JSON.stringify(data);
    res.writeHead(statusCode, {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload),
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    });
    res.end(payload);
  }

  private async readBodyBuffer(req: IncomingMessage): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      req.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
      req.on('end', () => resolve(Buffer.concat(chunks)));
      req.on('error', reject);
    });
  }

  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      });
      res.end();
      return;
    }

    const reqUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const pathname = reqUrl.pathname;
    const method = req.method || 'GET';

    // 1. Healthcheck: GET /v1/health
    if (method === 'GET' && (pathname === '/v1/health' || pathname === '/health')) {
      this.sendJson(res, 200, {
        status: 'ok',
        version: '1.0.0',
        uptime: (Date.now() - this.startTime) / 1000,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // 2. List & Search Plugins: GET /v1/plugins
    if (method === 'GET' && pathname === '/v1/plugins') {
      const query = reqUrl.searchParams.get('query') || undefined;
      const category = reqUrl.searchParams.get('category') || undefined;
      const tag = reqUrl.searchParams.get('tag') || undefined;
      const client_engine = reqUrl.searchParams.get('client_engine') || undefined;
      const client_version = reqUrl.searchParams.get('client_version') || undefined;
      const miyuna_version = reqUrl.searchParams.get('miyuna_version') || undefined;
      const page = parseInt(reqUrl.searchParams.get('page') || '1', 10);
      const limit = parseInt(reqUrl.searchParams.get('limit') || '20', 10);

      const result = this.store.search({
        query,
        category,
        tag,
        client_engine,
        client_version,
        miyuna_version,
        page,
        limit,
      });

      this.sendJson(res, 200, result);
      return;
    }

    // 3. Download Package: GET /v1/plugins/:id/versions/:version/download
    const downloadMatch = pathname.match(/^\/v1\/plugins\/([^/]+)\/versions\/([^/]+)\/download$/);
    if (method === 'GET' && downloadMatch) {
      const pluginId = decodeURIComponent(downloadMatch[1]);
      const version = decodeURIComponent(downloadMatch[2]);

      const versionRecord = this.store.getVersion(pluginId, version);
      if (!versionRecord) {
        this.sendJson(res, 404, {
          error: 'NOT_FOUND',
          message: `Package for '${pluginId}@${version}' not found`,
        });
        return;
      }

      this.store.incrementDownload(pluginId, version);

      const filename = `${pluginId}-${version}.mpk`;
      const headers: Record<string, string | number> = {
        'Content-Type': 'application/vnd.miyuna.plugin+zip',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': versionRecord.packageBuffer.length,
        'X-Package-SHA256': versionRecord.sha256,
        'Access-Control-Allow-Origin': '*',
      };

      if (versionRecord.signature) {
        headers['X-Package-Signature'] = versionRecord.signature;
      }

      res.writeHead(200, headers);
      res.end(versionRecord.packageBuffer);
      return;
    }

    // 4. Version Detail: GET /v1/plugins/:id/versions/:version
    const versionMatch = pathname.match(/^\/v1\/plugins\/([^/]+)\/versions\/([^/]+)$/);
    if (method === 'GET' && versionMatch) {
      const pluginId = decodeURIComponent(versionMatch[1]);
      const version = decodeURIComponent(versionMatch[2]);

      const versionRecord = this.store.getVersion(pluginId, version);
      if (!versionRecord) {
        this.sendJson(res, 404, {
          error: 'NOT_FOUND',
          message: `Version '${version}' not found for plugin '${pluginId}'`,
        });
        return;
      }

      this.sendJson(res, 200, {
        id: pluginId,
        version: versionRecord.version,
        manifest: versionRecord.manifest,
        downloadUrl: `/v1/plugins/${pluginId}/versions/${version}/download`,
        sha256: versionRecord.sha256,
        signature: versionRecord.signature || null,
        publisherKey: versionRecord.publisherKey || null,
        publishedAt: versionRecord.publishedAt,
        downloadCount: versionRecord.downloadCount,
      });
      return;
    }

    // 5. Plugin Detail: GET /v1/plugins/:id
    const pluginMatch = pathname.match(/^\/v1\/plugins\/([^/]+)$/);
    if (method === 'GET' && pluginMatch) {
      const pluginId = decodeURIComponent(pluginMatch[1]);
      const plugin = this.store.getPlugin(pluginId);

      if (!plugin) {
        this.sendJson(res, 404, {
          error: 'NOT_FOUND',
          message: `Plugin '${pluginId}' not found`,
        });
        return;
      }

      const clientEngine = reqUrl.searchParams.get('client_engine') || undefined;
      const clientVersion = reqUrl.searchParams.get('client_version') || undefined;
      const latest = this.store.getLatestVersion(plugin);
      const latestCompat = this.store.getLatestCompatibleVersion(plugin, clientEngine, clientVersion);

      const versionsList = this.store.getSortedVersions(plugin).map((v) => ({
        version: v.version,
        publishedAt: v.publishedAt,
        downloadUrl: `/v1/plugins/${plugin.id}/versions/${v.version}/download`,
        sha256: v.sha256,
        signature: v.signature || null,
        downloadCount: v.downloadCount,
        engines: v.manifest.engines,
      }));

      this.sendJson(res, 200, {
        id: plugin.id,
        name: plugin.name,
        description: plugin.description,
        category: plugin.category,
        tags: plugin.tags,
        author: plugin.author,
        repository: plugin.repository,
        latestVersion: latest?.version || '0.0.0',
        latestCompatibleVersion: latestCompat?.version || null,
        versions: versionsList,
        downloads: plugin.downloads,
        verifiedPublisher: plugin.verifiedPublisher,
        createdAt: plugin.createdAt,
        updatedAt: plugin.updatedAt,
      });
      return;
    }

    // 6. Publish Plugin: POST /v1/plugins/publish
    if (method === 'POST' && pathname === '/v1/plugins/publish') {
      const rawBody = await this.readBodyBuffer(req);

      let packageBuffer: Buffer;
      let signatureStr: string | undefined;
      let publicKeyStr: string | undefined;

      const contentType = req.headers['content-type'] || '';
      if (contentType.includes('application/json')) {
        let bodyJson: any;
        try {
          bodyJson = JSON.parse(rawBody.toString('utf-8'));
        } catch {
          this.sendJson(res, 400, {
            error: 'INVALID_JSON',
            message: 'Malformed JSON payload',
          });
          return;
        }

        if (!bodyJson.packageBase64) {
          this.sendJson(res, 400, {
            error: 'VALIDATION_ERROR',
            message: "Missing 'packageBase64' in publish payload",
          });
          return;
        }

        packageBuffer = Buffer.from(bodyJson.packageBase64, 'base64');
        signatureStr = bodyJson.signature;
        publicKeyStr = bodyJson.publicKey;
      } else {
        // Binary payload directly
        packageBuffer = rawBody;
        signatureStr = (req.headers['x-package-signature'] as string) || undefined;
        publicKeyStr = (req.headers['x-publisher-public-key'] as string) || undefined;
      }

      // Verify package integrity and optional signature
      const detachedSig = signatureStr ? Buffer.from(signatureStr, 'hex') : undefined;
      const verifyReport = verifyPackageBuffer(packageBuffer, publicKeyStr, detachedSig);

      if (!verifyReport.valid) {
        this.sendJson(res, 400, {
          error: 'VALIDATION_ERROR',
          message: `Package verification failed: ${verifyReport.error}`,
        });
        return;
      }

      const manifest = verifyReport.manifest!;

      // Save version into store
      try {
        const effectiveSig = signatureStr || (verifyReport.hasSignature ? 'embedded' : undefined);
        const versionRecord = this.store.saveVersion(
          manifest,
          packageBuffer,
          effectiveSig,
          publicKeyStr
        );

        this.sendJson(res, 201, {
          success: true,
          id: manifest.id,
          version: manifest.version,
          downloadUrl: `/v1/plugins/${manifest.id}/versions/${manifest.version}/download`,
          sha256: versionRecord.sha256,
          verifiedSignature: verifyReport.signatureVerified,
          message: `Plugin ${manifest.id}@${manifest.version} published successfully`,
        });
      } catch (err: any) {
        if (err.message.includes('already exists')) {
          this.sendJson(res, 409, {
            error: 'VERSION_CONFLICT',
            message: err.message,
          });
          return;
        }
        throw err;
      }
      return;
    }

    // Default 404
    this.sendJson(res, 404, {
      error: 'NOT_FOUND',
      message: `Endpoint ${method} ${pathname} not found`,
    });
  }
}
