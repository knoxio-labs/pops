import { installedManifests } from '../../installed-modules.js';
import { setRawSetting, getSettingOrNull } from '../settings/service.js';
import { resolveCredentials } from './credentials.js';
import { FeatureGateError, FeatureNotFoundError, FeatureScopeError } from './errors.js';
import { deleteUserSetting, getUserSetting, setUserSetting } from './user-settings.js';

import type { FeatureDefinition, FeatureManifest, FeatureStatus } from '@pops/types';

export { FeatureGateError, FeatureNotFoundError, FeatureScopeError } from './errors.js';

const USER_SETTING_PREFIX = 'feature.';

interface UserContext {
  email: string;
}

interface IsEnabledOptions {
  user?: UserContext | null;
}

function userSettingKey(featureKey: string): string {
  return `${USER_SETTING_PREFIX}${featureKey}`;
}

function parseBoolean(raw: string | null | undefined, fallback: boolean): boolean {
  if (raw === null || raw === undefined) return fallback;
  return raw === 'true' || raw === '1';
}

/**
 * Aggregate every `FeatureManifest` declared by an installed module's
 * manifest `features` slot. Module declaration order is preserved (so the
 * admin page renders modules in the order the registry installs them) and
 * intra-module manifest order matches the array order in the manifest.
 */
function collectFeatureManifests(): readonly FeatureManifest[] {
  return installedManifests().flatMap((m) => m.features ?? []);
}

interface ResolvedFeatureEntry {
  manifest: FeatureManifest;
  feature: FeatureDefinition;
}

/**
 * Resolve a feature key against the installed-module manifest set.
 * Returns `null` when the key is not declared by any installed module.
 */
function findFeature(key: string): ResolvedFeatureEntry | null {
  for (const manifest of collectFeatureManifests()) {
    const feature = manifest.features.find((f) => f.key === key);
    if (feature) return { manifest, feature };
  }
  return null;
}

/**
 * Resolve a feature key, throwing `FeatureNotFoundError` with the searched
 * module ids when no match is found. The thrown error names the calling
 * key plus the manifest ids that were searched so operators can quickly
 * tell whether the call site is using a stale key or whether the owning
 * module is excluded by `POPS_APPS`.
 */
function requireFeature(key: string): ResolvedFeatureEntry {
  const entry = findFeature(key);
  if (entry) return entry;
  const searched = installedManifests().map((m) => m.id);
  throw new FeatureNotFoundError(key, searched);
}

function readSystemValue(feature: FeatureDefinition): boolean | null {
  const key = feature.settingKey ?? feature.key;
  const row = getSettingOrNull(key);
  if (!row) return null;
  return parseBoolean(row.value, feature.default);
}

function writeSystemValue(feature: FeatureDefinition, enabled: boolean): void {
  setRawSetting(feature.settingKey ?? feature.key, enabled ? 'true' : 'false');
}

function readUserOverride(feature: FeatureDefinition, user: UserContext): boolean | null {
  if (feature.scope !== 'user') return null;
  const raw = getUserSetting(user.email, userSettingKey(feature.key));
  if (raw === null) return null;
  return parseBoolean(raw, feature.default);
}

interface ResolvedState {
  enabled: boolean;
  userOverride: boolean;
}

function resolveEnabledState(
  feature: FeatureDefinition,
  gateOk: boolean,
  user: UserContext | null
): ResolvedState {
  if (!gateOk) return { enabled: false, userOverride: false };

  if (feature.scope === 'user' && user) {
    const userValue = readUserOverride(feature, user);
    if (userValue !== null) return { enabled: userValue, userOverride: true };
  }

  const systemValue = readSystemValue(feature);
  return { enabled: systemValue ?? feature.default, userOverride: false };
}

function deriveState(gateOk: boolean, enabled: boolean): FeatureStatus['state'] {
  if (!gateOk) return 'unavailable';
  return enabled ? 'enabled' : 'disabled';
}

function buildFeatureStatus(
  manifestId: string,
  feature: FeatureDefinition,
  user: UserContext | null
): FeatureStatus {
  const capabilityMissing = feature.capabilityCheck ? !feature.capabilityCheck() : false;
  const { credentials, allConfigured } = resolveCredentials(feature);
  const gateOk = !capabilityMissing && allConfigured;
  const { enabled, userOverride } = resolveEnabledState(feature, gateOk, user);

  return {
    key: feature.key,
    manifestId,
    label: feature.label,
    description: feature.description,
    scope: feature.scope,
    enabled,
    default: feature.default,
    state: deriveState(gateOk, enabled),
    credentials,
    capabilityMissing: capabilityMissing || undefined,
    preview: feature.preview,
    deprecated: feature.deprecated,
    configureLink: feature.configureLink,
    userOverride: feature.scope === 'user' ? userOverride : undefined,
  };
}

/**
 * The single read path for runtime feature gating. Resolves in order:
 * capability check → required credentials → user override → system value → default.
 *
 * Throws `FeatureNotFoundError` when the key is not declared by any
 * installed module — this is a deliberate breaking change from the
 * pre-PRD-101 silent-`false` behaviour: hand-rolled registration could
 * drift, manifest-declared can't, so a missing key is now always a bug.
 */
export function isEnabled(key: string, options: IsEnabledOptions = {}): boolean {
  const { feature } = requireFeature(key);
  if (feature.capabilityCheck && !feature.capabilityCheck()) return false;

  const { allConfigured } = resolveCredentials(feature);
  if (!allConfigured) return false;

  if (feature.scope === 'user' && options.user) {
    const userValue = readUserOverride(feature, options.user);
    if (userValue !== null) return userValue;
  }

  const systemValue = readSystemValue(feature);
  return systemValue ?? feature.default;
}

/** Build the FeatureStatus list for the admin Features page. */
export function listFeatures(user: UserContext | null = null): FeatureStatus[] {
  const out: FeatureStatus[] = [];
  for (const manifest of collectFeatureManifests()) {
    for (const feature of manifest.features) {
      out.push(buildFeatureStatus(manifest.id, feature, user));
    }
  }
  return out;
}

/**
 * Return every installed module's `FeatureManifest` sorted by `order`,
 * matching the contract previously exposed by `featuresRegistry.getAll()`.
 * The admin Features page consumes this directly.
 */
export function getFeatureManifests(): readonly FeatureManifest[] {
  return collectFeatureManifests().toSorted((a, b) => a.order - b.order);
}

function ensureCanEnable(feature: FeatureDefinition): void {
  if (feature.capabilityCheck && !feature.capabilityCheck()) {
    throw new FeatureGateError(feature.key, [{ key: feature.key, source: 'missing' }]);
  }
  const { credentials, allConfigured } = resolveCredentials(feature);
  if (!allConfigured) {
    throw new FeatureGateError(
      feature.key,
      credentials.filter((c) => c.source === 'missing')
    );
  }
}

/** Set the system-level enabled state. Rejects when gating is failing. */
export function setFeatureEnabled(key: string, enabled: boolean): boolean {
  const { feature } = requireFeature(key);

  if (feature.scope === 'capability') {
    throw new FeatureScopeError(key, 'system|user', feature.scope);
  }
  if (enabled) ensureCanEnable(feature);

  writeSystemValue(feature, enabled);
  return enabled;
}

function requireUserScopedFeature(key: string): FeatureDefinition {
  const { feature } = requireFeature(key);
  if (feature.scope !== 'user') {
    throw new FeatureScopeError(key, 'user', feature.scope);
  }
  return feature;
}

/** Set a per-user override. Rejects when the feature is not user-scoped. */
export function setUserPreference(key: string, user: UserContext, enabled: boolean): boolean {
  const feature = requireUserScopedFeature(key);
  setUserSetting(user.email, userSettingKey(feature.key), enabled ? 'true' : 'false');
  return enabled;
}

/** Remove a per-user override; resolution falls back to the system default. */
export function clearUserPreference(key: string, user: UserContext): boolean {
  const feature = requireUserScopedFeature(key);
  return deleteUserSetting(user.email, userSettingKey(feature.key));
}
