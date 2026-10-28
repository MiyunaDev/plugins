/**
 * @file semver.ts
 * Lightweight semver comparator and engine compatibility matcher.
 */

import { PluginEngines } from '../../../../packages/contracts/src/manifest.js';

export type SemverTuple = [number, number, number];

export function parseSemver(version: string): SemverTuple | null {
  const match = version.trim().match(/^v?(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;
  return [parseInt(match[1], 10), parseInt(match[2], 10), parseInt(match[3], 10)];
}

export function compareSemver(v1: string, v2: string): number {
  const p1 = parseSemver(v1);
  const p2 = parseSemver(v2);
  if (!p1 || !p2) return 0;

  for (let i = 0; i < 3; i++) {
    if (p1[i] > p2[i]) return 1;
    if (p1[i] < p2[i]) return -1;
  }
  return 0;
}

/**
 * Checks if a specific version satisfies a single comparator (e.g. ">=1.0.0", "<2.0.0", "^1.2.0")
 */
function satisfiesSingleComparator(version: string, comparator: string): boolean {
  const comp = comparator.trim();
  if (comp === '*' || comp === '') return true;

  // Caret ranges: ^1.2.3 means >=1.2.3 <2.0.0 (or <0.2.0 if major is 0)
  if (comp.startsWith('^')) {
    const base = comp.slice(1);
    const parsed = parseSemver(base);
    if (!parsed) return false;
    if (compareSemver(version, base) < 0) return false;
    const [maj, min] = parsed;
    const upper = maj > 0 ? `${maj + 1}.0.0` : `0.${min + 1}.0`;
    return compareSemver(version, upper) < 0;
  }

  // Tilde ranges: ~1.2.3 means >=1.2.3 <1.3.0
  if (comp.startsWith('~')) {
    const base = comp.slice(1);
    const parsed = parseSemver(base);
    if (!parsed) return false;
    if (compareSemver(version, base) < 0) return false;
    const [maj, min] = parsed;
    const upper = `${maj}.${min + 1}.0`;
    return compareSemver(version, upper) < 0;
  }

  // Operator comparisons: >=, <=, >, <, =
  const match = comp.match(/^(>=|<=|>|<|=)?\s*v?(\d+\.\d+\.\d+.*)$/);
  if (!match) return false;

  const op = match[1] || '=';
  const target = match[2];
  const cmp = compareSemver(version, target);

  switch (op) {
    case '>=':
      return cmp >= 0;
    case '<=':
      return cmp <= 0;
    case '>':
      return cmp > 0;
    case '<':
      return cmp < 0;
    case '=':
    default:
      return cmp === 0;
  }
}

/**
 * Checks if a version satisfies a semver range (e.g. ">=1.0.0 <2.0.0" or "^1.2.0")
 */
export function satisfiesSemver(version: string, range: string | boolean | undefined): boolean {
  if (range === undefined || range === true || range === '*') return true;
  if (range === false) return false;
  if (typeof range !== 'string') return false;

  const trimmed = range.trim();
  if (trimmed === '*' || trimmed === '') return true;

  // Split by spaces (conjunction AND)
  const parts = trimmed.split(/\s+/).filter(Boolean);
  return parts.every((p) => satisfiesSingleComparator(version, p));
}

/**
 * Validates whether a plugin's engine specification is compatible with the host client.
 */
export function isEngineCompatible(
  engines: PluginEngines | undefined,
  clientEngine?: string,
  clientVersion?: string,
  miyunaVersion?: string
): boolean {
  if (!engines) return true;

  // 1. Check core platform compatibility (engines.miyuna)
  if (miyunaVersion && engines.miyuna) {
    if (!satisfiesSemver(miyunaVersion, engines.miyuna)) {
      return false;
    }
  }

  // 2. Check client engine compatibility
  if (clientEngine && engines.client) {
    const clientConstraint = engines.client[clientEngine];
    // If the plugin specifies client support and this client is explicitly false, incompatible
    if (clientConstraint === false) {
      return false;
    }
    // If client version is provided and there is a version constraint
    if (clientVersion && typeof clientConstraint === 'string') {
      if (!satisfiesSemver(clientVersion, clientConstraint)) {
        return false;
      }
    }
  }

  return true;
}
