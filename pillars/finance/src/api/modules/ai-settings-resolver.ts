/**
 * Cached resolver for the `aiCategorizer`/`ruleGen` settings group
 * (POPS-2589) — the one precedence ladder every AI call site in finance uses
 * to pick its model and token cap: an operator's stored setting, then the
 * site's existing env var (where one exists), then the site's own default.
 *
 * The whole group is read in a single `getBulk` and cached
 * in-process, keyed per `FinanceDb` handle so two handles open in the same
 * process (every test suite opens its own) never read each other's settings;
 * `invalidateAiSettingsCache` is called from the settings write handlers
 * (`api/rest/settings-handlers.ts`) so a save takes effect on the next read
 * with no restart. That cache is what keeps the per-row categorizer path
 * from paying a settings round trip per imported row — one import run of any
 * size shares the single cached read for its own handle.
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
  AI_CATEGORIZER_PRE_ACCEPT_PERCENT_KEY,
  RULE_GEN_MAX_TOKENS_KEY,
  RULE_GEN_MODEL_KEY,
} from '../../contract/settings/ai-settings-keys.js';

import type { FinanceDb } from '../../db/index.js';

// A key missing here is never read: every resolve falls through to its env var
// or default, silently, whatever the operator saved.
const AI_SETTINGS_KEYS = [
  AI_CATEGORIZER_MODEL_KEY,
  AI_CATEGORIZER_MAX_TOKENS_KEY,
  AI_CATEGORIZER_PRE_ACCEPT_PERCENT_KEY,
  RULE_GEN_MODEL_KEY,
  RULE_GEN_MAX_TOKENS_KEY,
] as const;

let cached = new WeakMap<FinanceDb, Record<string, string>>();

function readStore(db: FinanceDb): Record<string, string> {
  let forDb = cached.get(db);
  if (forDb === undefined) {
    forDb = getBulk(db, AI_SETTINGS_KEYS);
    cached.set(db, forDb);
  }
  return forDb;
}

/**
 * Drop the cached read. Called on every settings write (set/setMany/
 * resetKey/reset) so a save is observed by the next resolve instead of
 * requiring a process restart.
 *
 * Keyed per `FinanceDb` handle (a `WeakMap`, not one module-global value) —
 * two handles can be open in the same process (every corrections/settings
 * test suite opens its own), and without this a second handle's first read
 * would be served the first handle's cached settings. Pass `db` to drop only
 * that handle's entry; omit it to drop every handle's cache at once, which is
 * what the settings write handlers do since they don't know which other
 * handles might be live.
 */
export function invalidateAiSettingsCache(db?: FinanceDb): void {
  if (db) {
    cached.delete(db);
  } else {
    cached = new WeakMap();
  }
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

/**
 * Same precedence as {@link resolveAiString}, parsed as a whole-number
 * percentage and returned as a fraction in `[0, 1]` (POPS-3671). Stored as a
 * percentage because the settings form renders a number input with no `step`,
 * which a browser treats as integer-only. `0` is a real value — pre-accept
 * everything — so unlike {@link resolveAiMaxTokens} it does not fall through;
 * a non-integer or out-of-range value at any tier does.
 */
export function resolveAiPercent(
  db: FinanceDb,
  settingKey: string,
  envVar: string | undefined,
  fallbackPercent: number
): number {
  const raw = resolveAiString(db, settingKey, envVar, String(fallbackPercent));
  const parsed = Number(raw);
  const percent =
    Number.isInteger(parsed) && parsed >= 0 && parsed <= 100 ? parsed : fallbackPercent;
  return percent / 100;
}
