/**
 * `@pops/inventory/expression`: the catalogue's computed-field expression
 * model — the tree, its issue paths, slot typing, the operation palette and
 * the plain-language readback.
 *
 * It lives in the contract because it is a model of the catalogue's own
 * domain (field kinds, references, measurement units) and two packages need
 * it: the inventory app's catalogue editor and the design playground's
 * computed-editor kit. One model for both means the approved design and the
 * shipping editor cannot drift apart. Everything here is pure, browser-safe
 * and takes its whole world through arguments.
 */
export {
  findType,
  isFollowable,
  ownerType,
  readLabel,
  referenceTargets,
  resolveRead,
} from './catalogue-lookup.js';
export type { ResolvedHop, ResolvedRead } from './catalogue-lookup.js';
export { comparedChoiceField, formatLiteral, formula, staticDependencies } from './formula.js';
export type { StaticDependency } from './formula.js';
export { EXPRESSION_LIMITS, isNumericKind, isTextKind, valueTypeLabel } from './model.js';
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
} from './model.js';
export { GROUP_LABELS, OPERATIONS, operationBlockedReason, operationInfo } from './operations.js';
export type { OperationGroup, OperationInfo } from './operations.js';
export { evaluationErrorSentence, unavailableSentence } from './preview-copy.js';
export type { PreviewMissingInput } from './preview-copy.js';
export { fieldFitsSlot, needsDimensionalUnits, slotTypes } from './slot-types.js';
export {
  ROOT_PATH,
  expressionStats,
  issueBelongsTo,
  issueNodePath,
  nodeAt,
  nodeChildren,
  outlineRows,
  parentPath,
} from './tree.js';
export type { ExpressionStats, NodeChild, OutlineRow } from './tree.js';
