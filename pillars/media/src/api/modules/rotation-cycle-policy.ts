/**
 * Resolve the numeric rotation-cycle policy from the `rotation_settings` kv
 * table (api-layer). Reuses the wire-shaped {@link getRotationSettings} reader
 * (which already applies defaults for unset keys) and coerces the string
 * values to the numbers the cycle math expects, re-defaulting any non-finite
 * parse so a corrupt row can never NaN-poison the cycle.
 */
import { type MediaDb } from '../../db/index.js';
import { type RotationTuning } from './rotation-removal-ranking.js';
import { getRotationSettings, ROTATION_SETTING_KEYS } from './rotation-settings-config.js';

export interface RotationCyclePolicy {
  targetFreeGb: number;
  leavingDays: number;
  dailyAdditions: number;
  avgMovieGb: number;
  protectedDays: number;
  graceDays: number;
  tuning: RotationTuning;
}

function num(value: string, fallback: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Number(fallback);
}

/**
 * Read the numeric cycle policy (target free GB, leaving days, daily cap, avg
 * GB, protection window).
 */
export function getRotationCyclePolicy(db: MediaDb): RotationCyclePolicy {
  const settings = getRotationSettings(db);
  return {
    targetFreeGb: num(settings.targetFreeGb, ROTATION_SETTING_KEYS.targetFreeGb.default),
    leavingDays: num(settings.leavingDays, ROTATION_SETTING_KEYS.leavingDays.default),
    dailyAdditions: num(settings.dailyAdditions, ROTATION_SETTING_KEYS.dailyAdditions.default),
    avgMovieGb: num(settings.avgMovieGb, ROTATION_SETTING_KEYS.avgMovieGb.default),
    protectedDays: num(settings.protectedDays, ROTATION_SETTING_KEYS.protectedDays.default),
    graceDays: num(settings.graceDays, ROTATION_SETTING_KEYS.graceDays.default),
    tuning: {
      ageExponent: num(settings.ageExponent, ROTATION_SETTING_KEYS.ageExponent.default),
      ratingSpread: num(settings.ratingSpread, ROTATION_SETTING_KEYS.ratingSpread.default),
      keepUnwatched: num(settings.keepUnwatched, ROTATION_SETTING_KEYS.keepUnwatched.default),
      keepExponent: num(settings.keepExponent, ROTATION_SETTING_KEYS.keepExponent.default),
    },
  };
}

/**
 * The timestamp a protection granted now should expire at, `protectedDays`
 * ahead of the current time.
 *
 * Every caller that marks a movie `protected` must supply one: the removal
 * filter skips a `protected` row only while its expiry is in the future, so a
 * protection written without an expiry protects nothing.
 */
export function getProtectionExpiresAt(db: MediaDb): string {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + getRotationCyclePolicy(db).protectedDays);
  return expiresAt.toISOString();
}
