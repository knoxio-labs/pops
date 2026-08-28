/**
 * Feature manifest types — shared between API (registry / service) and frontend
 * (admin Features page renderer).
 *
 * Sits on top of the settings system (PRD-093). A feature is an on/off
 * capability; its credential dependencies are settings keys. The runtime
 * `features.isEnabled()` helper is the single read path for runtime gating.
 */

import { z } from 'zod';

import {
  AppPathSchema,
  CamelIdentifierSchema,
  PillarIdSchema,
  SettingsKeySchema,
} from './manifest-primitives.js';

/**
 * Runtime scope of a feature.
 * - `system`     — admin-only, single value across the deployment
 * - `user`       — per-user override on top of the system default
 * - `capability` — read-only runtime probe (Redis, sqlite-vec)
 */
export const FeatureScopeSchema = z.enum(['system', 'user', 'capability']);

export type FeatureScope = z.infer<typeof FeatureScopeSchema>;

/**
 * Declarative replacement for `FeatureDefinition.capabilityCheck` — the live
 * `() => boolean` probe is not serializable, so the manifest names which pillar
 * owns the probe (`pillar`) and the capability key it reports (`key`). The
 * actual up/down status is resolved later from that pillar's heartbeat
 * snapshot, never carried in the static manifest.
 */
export const FeatureCapabilitySchema = z
  .object({
    pillar: PillarIdSchema,
    key: CamelIdentifierSchema,
  })
  .strict();

export type FeatureCapability = z.infer<typeof FeatureCapabilitySchema>;

/**
 * The serializable feature declaration — what a pillar puts on the wire in its
 * manifest's `features` slot, and the single declaration of the feature shape
 * (ADR-049). `FeatureDefinition` below is this shape with the wire-only
 * `capability` descriptor swapped for the in-process `capabilityCheck` probe;
 * that swap is the whole difference between the two, stated once here rather
 * than kept in step across two packages by hand.
 */
export const FeatureDescriptorSchema = z
  .object({
    /** Globally unique key, namespaced by module: `media.plex.scheduler`. */
    key: SettingsKeySchema,
    label: z.string().min(1),
    description: z.string().optional(),
    /** Default state when no override is set and no gating is failing. */
    default: z.boolean(),
    scope: FeatureScopeSchema,
    /**
     * Settings keys whose resolved value (DB or `envFallback`) must be
     * non-empty for the feature to be activatable. Mirrors PRD-093 semantics —
     * an absent list means no credential gating.
     */
    requires: z.array(SettingsKeySchema).optional(),
    /**
     * Environment variables required when the credential is env-only (Docker
     * secret / dotenv). Treated identically to `requires`, resolved via
     * `getEnv()` rather than the settings table.
     */
    requiresEnv: z.array(z.string().min(1)).optional(),
    /**
     * Setting key that backs the system-level enabled state. Defaults to the
     * feature's own `key`. Lets a feature reuse a pre-existing setting key
     * (e.g. `media.plex.scheduler` reads `plex_scheduler_enabled`).
     */
    settingKey: SettingsKeySchema.optional(),
    /** Anchor link to the relevant Settings section: `/settings#media.plex`. */
    configureLink: AppPathSchema.optional(),
    capability: FeatureCapabilitySchema.optional(),
    /** Tag the feature as preview/experimental for grouping purposes. */
    preview: z.boolean().optional(),
    /** Mark for sunset planning. Surfaces in audit reports. */
    deprecated: z.boolean().optional(),
  })
  .strict();

export type FeatureDescriptor = z.infer<typeof FeatureDescriptorSchema>;

/**
 * A feature as the in-process feature service sees it: the declarative
 * descriptor, minus the wire-only `capability` reference, plus the live probe
 * that reference stands in for.
 *
 * The probe returns `true` when the underlying runtime supports the feature
 * (Redis available, sqlite-vec loaded). When defined, a `false` return makes
 * the feature `unavailable` regardless of settings or `requires`. It is
 * stripped before serialisation by the API and never reaches the frontend —
 * which is why the wire descriptor names a pillar and a capability key
 * instead.
 */
export type FeatureDefinition = Omit<FeatureDescriptor, 'capability'> & {
  capabilityCheck?: () => boolean;
};

export interface FeatureManifest {
  /** Module ID: `media`, `inventory`, `core`. Matches SettingsManifest convention. */
  id: string;
  title: string;
  icon?: string;
  order: number;
  features: FeatureDefinition[];
}

/** Runtime status of a feature — what the API returns to the admin page. */
export interface FeatureStatus {
  key: string;
  manifestId: string;
  label: string;
  description?: string;
  scope: FeatureScope;
  /** Resolved enabled state (after capability + credentials + override + default). */
  enabled: boolean;
  default: boolean;
  /**
   * Coarse status for the UI:
   * - `enabled`: the feature is currently on
   * - `disabled`: gating passes but the toggle is off
   * - `unavailable`: capability or required credentials missing
   */
  state: 'enabled' | 'disabled' | 'unavailable';
  /** Per-required-credential resolution. */
  credentials: FeatureCredentialStatus[];
  /** True when the capability check returned false. */
  capabilityMissing?: boolean;
  preview?: boolean;
  deprecated?: boolean;
  configureLink?: string;
  /** True when a per-user override is set (only meaningful for `scope: 'user'`). */
  userOverride?: boolean;
}

export interface FeatureCredentialStatus {
  key: string;
  /** Where the value comes from. `missing` means neither DB nor env. */
  source: 'database' | 'environment' | 'missing';
  /** Set when the resolution involved an env var (fallback or `requiresEnv`). */
  envVar?: string;
}
