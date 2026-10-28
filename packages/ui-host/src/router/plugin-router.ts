/**
 * @file plugin-router.ts
 * Namespaced route registry and resolver for UI plugin contributions.
 */

import { RouteContribution, PluginManifest } from '../../../contracts/src/manifest.js';

export interface RegisteredRoute {
  pluginId: string;
  contributionId: string;
  title: string;
  fullPath: string; // e.g. /ext/org.miyunadev.games/arcade
  relativeRoute: string; // e.g. /arcade
  entryPoint: string; // Absolute or relative path to HTML entry
  icon?: string;
  active: boolean;
}

export class PluginRouter {
  private routes = new Map<string, RegisteredRoute>(); // fullPath -> RegisteredRoute
  private pluginRoutes = new Map<string, Set<string>>(); // pluginId -> Set of fullPaths

  /**
   * Registers all route contributions declared in a plugin's manifest.
   */
  public registerPluginRoutes(
    pluginId: string,
    manifest: PluginManifest,
    baseInstallDir: string
  ): RegisteredRoute[] {
    if (!manifest.contributions) return [];

    const registered: RegisteredRoute[] = [];
    const fullPaths = new Set<string>();

    for (const contrib of manifest.contributions) {
      if (contrib.type !== 'route') continue;

      const route = contrib as RouteContribution;
      const cleanRelative = route.path.startsWith('/') ? route.path : `/${route.path}`;
      const fullPath = `/ext/${pluginId}${cleanRelative === '/' ? '' : cleanRelative}`;

      if (this.routes.has(fullPath)) {
        throw new Error(`Route collision detected: '${fullPath}' is already registered`);
      }

      const regRoute: RegisteredRoute = {
        pluginId,
        contributionId: route.id,
        title: route.title,
        fullPath,
        relativeRoute: cleanRelative,
        entryPoint: manifest.artifact.entry,
        icon: route.icon,
        active: true,
      };

      this.routes.set(fullPath, regRoute);
      fullPaths.add(fullPath);
      registered.push(regRoute);
    }

    this.pluginRoutes.set(pluginId, fullPaths);
    return registered;
  }

  /**
   * Unregisters all routes registered by a specific plugin.
   */
  public unregisterPluginRoutes(pluginId: string): number {
    const paths = this.pluginRoutes.get(pluginId);
    if (!paths) return 0;

    let count = 0;
    for (const p of paths) {
      if (this.routes.delete(p)) {
        count++;
      }
    }

    this.pluginRoutes.delete(pluginId);
    return count;
  }

  /**
   * Sets active status for a plugin's routes (e.g. during activate/deactivate).
   */
  public setPluginRoutesActive(pluginId: string, active: boolean): void {
    const paths = this.pluginRoutes.get(pluginId);
    if (!paths) return;

    for (const p of paths) {
      const route = this.routes.get(p);
      if (route) {
        route.active = active;
      }
    }
  }

  /**
   * Resolves a URL path to a registered plugin route.
   */
  public resolveRoute(path: string): RegisteredRoute | undefined {
    const normalized = path.replace(/\/+$/, '') || '/';
    const match = this.routes.get(normalized);
    if (match && match.active) {
      return match;
    }
    return undefined;
  }

  /**
   * Returns all currently registered active routes across all plugins.
   */
  public listActiveRoutes(): RegisteredRoute[] {
    return Array.from(this.routes.values()).filter((r) => r.active);
  }
}
