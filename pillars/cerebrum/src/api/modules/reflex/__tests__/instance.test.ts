/**
 * Unit tests for reflex config-path resolution.
 *
 * The engram root is `CEREBRUM_ENGRAMS_DIR` everywhere else in the pillar, but
 * this resolver read `ENGRAM_ROOT` — a name nothing sets — until POPS-2737.
 * The ladder therefore fell through to its cwd-relative last resort, and
 * `updateReflexConfig` wrote the TOML back under the container's root-owned
 * /app with EACCES. These cases pin the ladder to the canonical name.
 */
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { resolveReflexConfigPath } from '../instance.js';

const CWD_DEFAULT = join(process.cwd(), 'engrams', '.config', 'reflexes.toml');

describe('resolveReflexConfigPath', () => {
  it('prefers an explicit file path over every directory variable', () => {
    const resolved = resolveReflexConfigPath({
      CEREBRUM_REFLEX_CONFIG: '/etc/pops/reflexes.toml',
      CEREBRUM_REFLEX_CONFIG_DIR: '/data/cerebrum/reflex',
      CEREBRUM_ENGRAMS_DIR: '/data/cerebrum/engrams',
    });
    expect(resolved).toBe('/etc/pops/reflexes.toml');
  });

  it('falls back to the engram root the rest of the pillar uses', () => {
    const resolved = resolveReflexConfigPath({ CEREBRUM_ENGRAMS_DIR: '/data/cerebrum/engrams' });
    expect(resolved).toBe('/data/cerebrum/engrams/.config/reflexes.toml');
  });

  it('lets the reflex-specific directory win over the engram root', () => {
    const resolved = resolveReflexConfigPath({
      CEREBRUM_REFLEX_CONFIG_DIR: '/data/cerebrum/reflex',
      CEREBRUM_ENGRAMS_DIR: '/data/cerebrum/engrams',
    });
    expect(resolved).toBe('/data/cerebrum/reflex/.config/reflexes.toml');
  });

  it('ignores the retired ENGRAM_ROOT name', () => {
    // Fails before the fix: ENGRAM_ROOT used to satisfy step 2, which is how a
    // stale .env.example name silently outranked the one compose actually sets.
    const resolved = resolveReflexConfigPath({ ENGRAM_ROOT: '/data/cerebrum/engrams' });
    expect(resolved).toBe(CWD_DEFAULT);
  });

  it('treats an empty engram root as unset', () => {
    expect(resolveReflexConfigPath({ CEREBRUM_ENGRAMS_DIR: '' })).toBe(CWD_DEFAULT);
  });

  it('falls back to a cwd-relative path when nothing is configured', () => {
    expect(resolveReflexConfigPath({})).toBe(CWD_DEFAULT);
  });
});
