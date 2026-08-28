/**
 * @pops/types — Shared cross-package type definitions for POPS.
 */

export type {
  MatchType,
  Query,
  SearchAdapter,
  SearchContext,
  SearchHit,
  StructuredFilter,
} from './search.js';
export {
  SettingsFieldSchema,
  SettingsFieldTypeSchema,
  SettingsGroupSchema,
  SettingsManifestSchema,
  SettingsWidgetSchema,
} from './settings-manifest.js';
export type {
  SettingsField,
  SettingsFieldType,
  SettingsGroup,
  SettingsManifest,
  SettingsWidget,
} from './settings-manifest.js';
export {
  FeatureCapabilitySchema,
  FeatureDescriptorSchema,
  FeatureScopeSchema,
} from './feature-manifest.js';
export type {
  FeatureCapability,
  FeatureCredentialStatus,
  FeatureDefinition,
  FeatureDescriptor,
  FeatureManifest,
  FeatureScope,
  FeatureStatus,
} from './feature-manifest.js';
export type { Capability } from './capability.js';
export type { UriHandlerDescriptor, UriResolution, UriResolverResult } from './uri-handler.js';
export type { PillarHealth, PillarRegistryEntry } from './pillar-registry.js';
export type { AiToolDescriptor, AiToolHandler, AiToolResult } from './ai-tool.js';
export type { MigrationDescriptor } from './migration.js';
export type { SearchAdapterDescriptor } from './search-adapter.js';
export type { IngestSourceDescriptor } from './ingest-source.js';
export { assertModuleManifest, ModuleCaptureOverlayConfigSchema } from './module-manifest.js';
export type {
  ModuleBackendManifest,
  ModuleCaptureOverlayConfig,
  ModuleFrontendManifest,
  ModuleManifest,
  ModuleOverlayConfig,
  ModuleSurface,
  OverlayComponentLoader,
} from './module-manifest.js';
export {
  AppPathSchema,
  CamelIdentifierSchema,
  I18nKeySchema,
  KebabIdentifierSchema,
  PillarIdSchema,
  ProcedurePathSchema,
  SettingsKeySchema,
} from './manifest-primitives.js';
