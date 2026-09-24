/**
 * What the design playground may see of this app package.
 *
 * `pillars/design` draws the POPS web chrome around a screen it is
 * reviewing, and draws it from the real nav config rather than a copy — so a
 * rail item added here shows up there without anyone remembering to mirror
 * it. Kept apart from `index.ts` because that entry registers search result
 * components as a side effect, which the playground has no use for.
 *
 * The computed-field expression model is published here too: the playground's
 * computed-editor kit and the catalogue editor share one model of the tree,
 * its issue paths, its palette and its readback, so the approved design and
 * the shipping editor cannot drift apart. Everything under `expression/` is
 * pure and takes its whole world through arguments.
 */
export { navConfig } from './nav';

export { HopLimitNotice } from './catalogue-editor/computed/HopLimitNotice';

export {
  findType,
  isFollowable,
  ownerType,
  readLabel,
  referenceTargets,
  resolveRead,
} from './catalogue-editor/expression/catalogue-lookup';
export type { ResolvedHop, ResolvedRead } from './catalogue-editor/expression/catalogue-lookup';
export {
  comparedChoiceField,
  formatLiteral,
  formula,
  staticDependencies,
} from './catalogue-editor/expression/formula';
export type { StaticDependency } from './catalogue-editor/expression/formula';
export {
  EXPRESSION_LIMITS,
  isNumericKind,
  isTextKind,
  valueTypeLabel,
} from './catalogue-editor/expression/model';
export type {
  BinaryOp,
  ExpressionContext,
  ExpressionField,
  ExpressionNode,
  ExpressionType,
  LiteralValue,
  NodeOp,
  ReadNode,
  SlotType,
  ValueKind,
  ValueType,
} from './catalogue-editor/expression/model';
export {
  GROUP_LABELS,
  OPERATIONS,
  operationBlockedReason,
  operationInfo,
} from './catalogue-editor/expression/operations';
export type { OperationGroup, OperationInfo } from './catalogue-editor/expression/operations';
export {
  combineUnits,
  describeDimension,
  formatUnitTerm,
  parseUnitTerm,
  sameDimension,
  termDimension,
  unitConversionShift,
  unitDimension,
} from '@pops/inventory';
export type { CombinedUnit, UnitDimension, UnitFactor, UnitTerm } from '@pops/inventory';
export {
  evaluationErrorSentence,
  unavailableSentence,
} from './catalogue-editor/expression/preview-copy';
export type { PreviewMissingInput } from './catalogue-editor/expression/preview-copy';
export { fieldFitsSlot, slotTypes } from './catalogue-editor/expression/slot-types';
export {
  ROOT_PATH,
  expressionStats,
  issueBelongsTo,
  issueNodePath,
  nodeAt,
  nodeChildren,
  outlineRows,
  parentPath,
} from './catalogue-editor/expression/tree';
export type { ExpressionStats, NodeChild, OutlineRow } from './catalogue-editor/expression/tree';
