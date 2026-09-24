export {
  ManifestPayloadSchema,
  type ManifestPayload,
  type SinkDescriptor,
  type FeatureManifestDescriptor,
  type SettingsManifestDescriptor,
  type CaptureOverlayDescriptor,
  type NavConfigDescriptor,
  type NavItemDescriptor,
  type PageDescriptor,
  type TopBarWidgetDescriptor,
} from './schema.js';
export {
  validateManifestPayload,
  checkContractPackageMatchesPillar,
  checkContractTagMatchesVersion,
  checkAiToolAllowedUriTypesAreDeclared,
  checkSearchAdapterProceduresAreDeclared,
  checkUiPillarDeclaresStylesheet,
  pathToDotted,
  type ValidationResult,
  type ValidationIssue,
} from './validate.js';
export { NAV_COLOR } from './ui.js';
