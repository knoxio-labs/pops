/**
 * Feature toggles module (PRD-094, PRD-101 US-05).
 *
 * The runtime registry is the manifest `features` slot on each module's
 * `manifest.ts`, aggregated by `installedManifests()` (PRD-101 US-05); this
 * package no longer exports a side-effect `featuresRegistry` — modules
 * declare their FeatureManifest list directly in their manifest.
 */
export {
  clearUserPreference,
  FeatureGateError,
  FeatureNotFoundError,
  FeatureScopeError,
  getFeatureManifests,
  isEnabled,
  listFeatures,
  setFeatureEnabled,
  setUserPreference,
} from './service.js';
export { featuresRouter } from './router.js';
