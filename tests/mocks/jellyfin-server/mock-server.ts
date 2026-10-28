/**
 * @file mock-server.ts
 * Headless HTTP mock Jellyfin server for automated connector integration testing.
 */

import { createServer, Server, IncomingMessage, ServerResponse } from 'node:http';

export interface MockJellyfinOptions {
  port?: number;
}

export class MockJellyfinServer {
  private server: Server;
  public port: number = 0;
  public baseUrl: string = '';
  public validToken: string = 'test-jellyfin-token-xyz123';

  constructor(options: MockJellyfinOptions = {}) {
    this.server = createServer((req, res) => this.handleRequest(req, res));
    if (options.port) {
      this.port = options.port;
    }
  }

  private async parseBody(req: IncomingMessage): Promise<any> {
    return new Promise((resolve) => {
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch {
          resolve({});
        }
      });
    });
  }

  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url || '/', `http://127.0.0.1:${this.port}`);
    res.setHeader('Content-Type', 'application/json');

    // 1. Public Info
    if (req.method === 'GET' && url.pathname === '/System/Info/Public') {
      res.statusCode = 200;
      res.end(
        JSON.stringify({
          ServerName: 'Mock Jellyfin Server',
          Version: '10.8.13',
          Id: 'mock-jellyfin-id',
        })
      );
      return;
    }

    // 2. Authentication
    if (req.method === 'POST' && url.pathname === '/Users/AuthenticateByName') {
      const body = await this.parseBody(req);
      const username = body.Username || 'tester';

      res.statusCode = 200;
      res.end(
        JSON.stringify({
          AccessToken: this.validToken,
          ServerId: 'mock-jellyfin-id',
          User: {
            Id: 'user-demo-1',
            Name: username,
          },
        })
      );
      return;
    }

    // 3. Media Items (Requires auth token)
    if (req.method === 'GET' && url.pathname === '/Items') {
      const token =
        req.headers['x-emby-token'] ||
        (req.headers['authorization']?.startsWith('Bearer ')
          ? req.headers['authorization'].slice(7)
          : null);

      if (token !== this.validToken) {
        res.statusCode = 401;
        res.end(
          JSON.stringify({
            message: 'Unauthorized: Invalid or missing token',
          })
        );
        return;
      }

      res.statusCode = 200;
      res.end(
        JSON.stringify({
          Items: [
            {
              Id: 'item-1',
              Name: 'Cyberpunk: Edgerunners',
              Type: 'Series',
              CommunityRating: 8.6,
              Overview: 'A street kid trying to survive in a technology and body modification-obsessed city.',
            },
            {
              Id: 'item-2',
              Name: "Frieren: Beyond Journey's End",
              Type: 'Series',
              CommunityRating: 9.1,
              Overview: 'An elf mage and her companions have defeated the Demon King and brought peace.',
            },
            {
              Id: 'item-3',
              Name: 'Spirited Away',
              Type: 'Movie',
              CommunityRating: 8.9,
              Overview: 'A sullen 10-year-old girl wanders into a world ruled by gods, witches, and spirits.',
            },
          ],
          TotalRecordCount: 3,
        })
      );
      return;
    }

    res.statusCode = 404;
    res.end(JSON.stringify({ error: 'Endpoint Not Found' }));
  }

  public async start(): Promise<string> {
    return new Promise((resolve) => {
      this.server.listen(this.port, '127.0.0.1', () => {
        const addr = this.server.address() as any;
        this.port = addr.port;
        this.baseUrl = `http://127.0.0.1:${this.port}`;
        resolve(this.baseUrl);
      });
    });
  }

  public async stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }
}
