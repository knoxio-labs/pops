/**
 * Glia threshold loader for `engrams/.config/glia.toml` (PRD-086 US-03 AC #7).
 *
 * Reads `[trust.graduation]` from the toml file and exposes a partial
 * {@link GraduationThresholds} object containing only the keys the user set.
 *
 * Hot-reload semantics: the parsed result is cached and re-validated against
 * the file's mtime on every call. Edits to `glia.toml` are picked up on the
 * next evaluation without restart. If the file is absent or unreadable the
 * loader returns an empty object so callers can fall back to other sources.
 */
import { statSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { parse as parseToml } from 'smol-toml';

import type { GraduationThresholds } from './types.js';

/** Subset of {@link GraduationThresholds} expressible in `glia.toml`. */
export type PartialGraduationThresholds = Partial<GraduationThresholds>;

const CONFIG_RELATIVE_PATH = join('.config', 'glia.toml');

interface CacheEntry {
  mtimeMs: number;
  thresholds: PartialGraduationThresholds;
}

const cache = new Map<string, CacheEntry>();

/** Resolve the absolute path to `<engramRoot>/.config/glia.toml`. */
export function gliaTomlPath(engramRoot: string): string {
  return join(engramRoot, CONFIG_RELATIVE_PATH);
}

function readNumber(obj: Record<string, unknown>, key: string): number | undefined {
  const value = obj[key];
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return undefined;
}

function pickGraduationSection(parsed: Record<string, unknown>): Record<string, unknown> {
  const trust = parsed['trust'];
  if (typeof trust !== 'object' || trust === null) return {};
  const graduation = (trust as Record<string, unknown>)['graduation'];
  if (typeof graduation !== 'object' || graduation === null) return {};
  return graduation as Record<string, unknown>;
}

/** Parse the `[trust.graduation]` block into a partial thresholds object. */
export function parseGliaToml(content: string): PartialGraduationThresholds {
  let raw: Record<string, unknown>;
  try {
    raw = parseToml(content) as Record<string, unknown>;
  } catch (err) {
    console.warn(`[cerebrum] glia.toml parse failed: ${(err as Error).message}`);
    return {};
  }

  const section = pickGraduationSection(raw);
  const result: PartialGraduationThresholds = {};

  const proposeMinApproved = readNumber(section, 'propose_to_act_report_min_approved');
  if (proposeMinApproved !== undefined) result.proposeToActReportMinApproved = proposeMinApproved;

  const maxRejectionRate = readNumber(section, 'propose_to_act_report_max_rejection_rate');
  if (maxRejectionRate !== undefined) result.proposeToActReportMaxRejectionRate = maxRejectionRate;

  const minDays = readNumber(section, 'act_report_to_silent_min_days');
  if (minDays !== undefined) result.actReportToSilentMinDays = minDays;

  const demotionThreshold = readNumber(section, 'demotion_revert_threshold');
  if (demotionThreshold !== undefined) result.demotionRevertThreshold = demotionThreshold;

  const demotionWindow = readNumber(section, 'demotion_window_days');
  if (demotionWindow !== undefined) result.demotionWindowDays = demotionWindow;

  return result;
}

/**
 * Load partial thresholds from `<engramRoot>/.config/glia.toml`.
 *
 * Returns an empty object when the file is missing or unreadable. Uses an
 * mtime-keyed cache so repeated calls within the same process do not re-read
 * the disk unless the file has changed.
 */
export function loadGliaToml(engramRoot: string): PartialGraduationThresholds {
  const path = gliaTomlPath(engramRoot);

  let mtimeMs: number;
  try {
    mtimeMs = statSync(path).mtimeMs;
  } catch {
    cache.delete(path);
    return {};
  }

  const cached = cache.get(path);
  if (cached && cached.mtimeMs === mtimeMs) {
    return cached.thresholds;
  }

  let content: string;
  try {
    content = readFileSync(path, 'utf8');
  } catch (err) {
    console.warn(`[cerebrum] glia.toml read failed at ${path}: ${(err as Error).message}`);
    cache.delete(path);
    return {};
  }

  const thresholds = parseGliaToml(content);
  cache.set(path, { mtimeMs, thresholds });
  return thresholds;
}

/** Test hook — clear the mtime cache. */
export function resetGliaTomlCache(): void {
  cache.clear();
}
