/**
 * Resolve the numeric rotation-cycle policy from the `rotation_settings` kv
 * table (api-layer). Reuses the wire-shaped {@link getRotationSettings} reader
 * (which already applies defaults for unset keys) and coerces the string
 * values to the numbers the cycle math expects, re-defaulting any non-finite
 * parse so a corrupt row can never NaN-poison the cycle.
 */
import { type MediaDb } from '../../db/index.js';
import { getRotationSettings, ROTATION_SETTING_KEYS } from './rotation-settings-config.js';

export interface RotationCyclePolicy {
  targetFreeGb: number;
  leavingDays: number;
  dailyAdditions: number;
  avgMovieGb: number;
  protectedDays: number;
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
