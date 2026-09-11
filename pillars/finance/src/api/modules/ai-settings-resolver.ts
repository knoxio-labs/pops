/**
 * Cached resolver for the `aiCategorizer`/`ruleGen` settings group
 * (POPS-2589) — the one precedence ladder every AI call site in finance uses
 * to pick its model and token cap: an operator's stored setting, then the
 * site's existing env var (where one exists), then the site's own default.
 *
 * The whole four-key group is read in a single `getBulk` and cached
 * in-process; `invalidateAiSettingsCache` is called from the settings write
 * handlers (`api/rest/settings-handlers.ts`) so a save takes effect on the
 * next read with no restart. That cache is what keeps the per-row
 * categorizer path from paying a settings round trip per imported row — one
 * import run of any size shares the single cached read.
 *
 * A stored value of `''` is treated the same as "not set" (falls through to
 * the env var / default) rather than resolving to an empty model id or a
 * zero token cap, which would otherwise silently break every call until the
 * operator noticed and fixed it.
 */
import { getBulk } from '@pops/pillar-settings/service';

import {
  AI_CATEGORIZER_MAX_TOKENS_KEY,
  AI_CATEGORIZER_MODEL_KEY,
  RULE_GEN_MAX_TOKENS_KEY,
  RULE_GEN_MODEL_KEY,
} from '../../contract/settings/ai-settings-keys.js';

import type { FinanceDb } from '../../db/index.js';

const AI_SETTINGS_KEYS = [
  AI_CATEGORIZER_MODEL_KEY,
  AI_CATEGORIZER_MAX_TOKENS_KEY,
  RULE_GEN_MODEL_KEY,
  RULE_GEN_MAX_TOKENS_KEY,
] as const;

let cached: Record<string, string> | undefined;

function readStore(db: FinanceDb): Record<string, string> {
  cached ??= getBulk(db, AI_SETTINGS_KEYS);
  return cached;
}

/**
 * Drop the cached read. Called on every settings write (set/setMany/
 * resetKey/reset) so a save is observed by the next resolve instead of
 * requiring a process restart.
 */
export function invalidateAiSettingsCache(): void {
  cached = undefined;
}

function storedOverride(db: FinanceDb, key: string): string | undefined {
  const value = readStore(db)[key];
  return value !== undefined && value !== '' ? value : undefined;
}

/** setting > env var > fallback. Pass `envVar` as `undefined` for a call site that has never had one. */
export function resolveAiString(
  db: FinanceDb,
  settingKey: string,
  envVar: string | undefined,
  fallback: string
): string {
  const fromEnv = envVar !== undefined ? process.env[envVar] : undefined;
  return storedOverride(db, settingKey) ?? fromEnv ?? fallback;
}

/**
 * Same precedence as {@link resolveAiString}, parsed as a positive integer.
 * An unset, non-numeric, non-integer, or non-positive value at any tier
 * falls through to `fallback` — mirroring the env-only parsing every call
 * site already did.
 */
export function resolveAiMaxTokens(
  db: FinanceDb,
  settingKey: string,
  envVar: string | undefined,
  fallback: number
): number {
  const raw = resolveAiString(db, settingKey, envVar, String(fallback));
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
