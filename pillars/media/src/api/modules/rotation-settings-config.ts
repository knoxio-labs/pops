/**
 * Rotation settings read/save logic (api-layer).
 *
 * Maps the wire-shaped settings names to their `rotation_settings` keys, reads
 * them with defaults for unset keys, and writes the provided subset. Ported
 * from the monolith `rotation-config-router.ts`, repointed off `core/settings`
 * onto the pillar-owned kv table.
 */
import { type MediaDb, rotationSettingsService } from '../../db/index.js';

/** Each rotation setting: its kv key and its string default. */
export const ROTATION_SETTING_KEYS = {
  enabled: { key: 'rotation_enabled', default: '' },
  cronExpression: { key: 'rotation_cron_expression', default: '0 3 * * *' },
  targetFreeGb: { key: 'rotation_target_free_gb', default: '100' },
  leavingDays: { key: 'rotation_leaving_days', default: '7' },
  dailyAdditions: { key: 'rotation_daily_additions', default: '2' },
  avgMovieGb: { key: 'rotation_avg_movie_gb', default: '15' },
  protectedDays: { key: 'rotation_protected_days', default: '30' },
  ageExponent: { key: 'rotation_age_exponent', default: '1.2' },
  ratingSpread: { key: 'rotation_rating_spread', default: '3' },
  keepUnwatched: { key: 'rotation_keep_unwatched', default: '2.5' },
  keepExponent: { key: 'rotation_keep_exponent', default: '1.4' },
  /**
   * The removal ranking's grace window. Distinct from `protectedDays` — which
   * is the reprieve a manual cancel grants — though it defaults to the same 30
   * so separating the two changes no behaviour. They were one setting only
   * because the cycle happened to pass `protectedDays` as `graceDays`, and a
   * slider that silently relengthened every manual reprieve would be a trap.
   */
  graceDays: { key: 'rotation_grace_days', default: '30' },
} as const satisfies Record<string, { key: string; default: string }>;

export type RotationSettingName = keyof typeof ROTATION_SETTING_KEYS;

export type RotationSettings = Record<RotationSettingName, string>;

/** The full wire input the save endpoint accepts (all fields optional). */
export interface SaveSettingsInput {
  enabled?: boolean;
  cronExpression?: string;
  targetFreeGb?: number;
  leavingDays?: number;
  dailyAdditions?: number;
  avgMovieGb?: number;
  protectedDays?: number;
  ageExponent?: number;
  ratingSpread?: number;
  keepUnwatched?: number;
  keepExponent?: number;
  graceDays?: number;
}

/** Read all rotation settings, falling back to defaults for unset keys. */
export function getRotationSettings(db: MediaDb): RotationSettings {
  const keys = Object.values(ROTATION_SETTING_KEYS).map((d) => d.key);
  const stored = rotationSettingsService.getMany(db, keys);
  const result = {} as RotationSettings;
  for (const name of Object.keys(ROTATION_SETTING_KEYS) as RotationSettingName[]) {
    const def = ROTATION_SETTING_KEYS[name];
    result[name] = stored[def.key] ?? def.default;
  }
  return result;
}

/** True when rotation is switched on in the pillar-owned settings store. */
export function isRotationEnabled(db: MediaDb): boolean {
  return rotationSettingsService.get(db, ROTATION_SETTING_KEYS.enabled.key) === 'true';
}

function encodeBoolean(value: boolean): string {
  return value ? 'true' : '';
}

/** Per-field encoders: each maps the wire value to its stored string form. */
const ENCODERS: {
  [K in RotationSettingName]: (input: SaveSettingsInput) => string | undefined;
} = {
  enabled: (i) => (i.enabled === undefined ? undefined : encodeBoolean(i.enabled)),
  cronExpression: (i) => i.cronExpression,
  targetFreeGb: (i) => (i.targetFreeGb === undefined ? undefined : String(i.targetFreeGb)),
  leavingDays: (i) => (i.leavingDays === undefined ? undefined : String(i.leavingDays)),
  dailyAdditions: (i) => (i.dailyAdditions === undefined ? undefined : String(i.dailyAdditions)),
  avgMovieGb: (i) => (i.avgMovieGb === undefined ? undefined : String(i.avgMovieGb)),
  protectedDays: (i) => (i.protectedDays === undefined ? undefined : String(i.protectedDays)),
  ageExponent: (i) => (i.ageExponent === undefined ? undefined : String(i.ageExponent)),
  ratingSpread: (i) => (i.ratingSpread === undefined ? undefined : String(i.ratingSpread)),
  keepUnwatched: (i) => (i.keepUnwatched === undefined ? undefined : String(i.keepUnwatched)),
  keepExponent: (i) => (i.keepExponent === undefined ? undefined : String(i.keepExponent)),
  graceDays: (i) => (i.graceDays === undefined ? undefined : String(i.graceDays)),
};

/** Persist the provided settings subset. Returns the number of keys written. */
export function saveRotationSettings(db: MediaDb, input: SaveSettingsInput): number {
  const entries: { key: string; value: string }[] = [];
  for (const name of Object.keys(ROTATION_SETTING_KEYS) as RotationSettingName[]) {
    const value = ENCODERS[name](input);
    if (value !== undefined) entries.push({ key: ROTATION_SETTING_KEYS[name].key, value });
  }
  rotationSettingsService.setMany(db, entries);
  return entries.length;
}
