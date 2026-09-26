/**
 * `@pops/inventory/labels`: the QR label model behind the label print page,
 * the adhesive A4 sheets it prints on, where each label lands, and which
 * template each item gets.
 *
 * It lives in the contract because two packages need it: the inventory app's
 * label page and the design playground's print kit, so the approved design
 * and the shipping page cannot drift apart. Everything here is pure and
 * browser-safe; dimensions are millimetres, type sizes points.
 */
export { codeFitsOneLine, fitCodePt } from './code-fit.js';
export {
  autoParts,
  DEFAULT_LABEL_CONTENT,
  describeContent,
  fieldChoices,
  LABEL_PARTS,
  LABEL_PRESETS,
  matchingPreset,
  NO_DETAILS,
  presetById,
  resolveLabel,
  tickedParts,
  toggleField,
  togglePart,
  type LabelContent,
  type LabelDetails,
  type LabelFieldChoice,
  type LabelFieldValue,
  type LabelPart,
  type LabelPreset,
  type LabelPresetId,
  type ResolvedLabel,
} from './label-content.js';
export {
  estimateLines,
  fillQrMm,
  fitList,
  fitNamePt,
  fitToSheet,
  planLabel,
  type FittedList,
  type LabelArrangement,
  type LabelPlan,
} from './label-layout.js';
export {
  DEFAULT_COPIES,
  itemUri,
  resolveTemplate,
  type CopiesByKind,
  type LabelTemplateChoice,
  type PrintSubject,
} from './label-subject.js';
export { geometryOf, parseSheetGeometry, sheetGeometryProblems } from './sheet-geometry.js';
export {
  A4_HEIGHT_MM,
  A4_WIDTH_MM,
  clampStartAt,
  CUSTOM_SHEET_ID,
  customLayout,
  deriveScale,
  describeLayout,
  LABEL_GAP_MM,
  labelsPerSheet,
  MIN_QR_MM,
  MIN_QR_MODULE_MM,
  MIN_TEXT_MM,
  QR_EXTENT_MODULES,
  slotOrigin,
  templateFits,
  textWidthMm,
  type LabelScale,
  type LabelTemplateId,
  type SheetGeometry,
  type SheetLayout,
} from './sheet-layouts.js';
export { DEFAULT_SHEET_ID, findPreset, SHEET_PRESETS, sheetLayout } from './sheet-presets.js';
export {
  expandCopies,
  nextStartAt,
  pageCount,
  planSheets,
  type SheetPage,
  type SheetSlot,
} from './sheet-plan.js';
