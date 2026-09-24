import { electronicsContext, storageBoxContext } from './inventory-computed-catalogue';
import { dimensionalScenarios } from './inventory-computed-dimensional-scenarios';
import {
  cycleIssue,
  displayName,
  displayNameInProgress,
  emptyExpression,
  fieldUnknownIssue,
  insuredValue,
  needsAttention,
  perUnitSaving,
  replacementFromAnyType,
  replacementValue,
  replacementValueCycle,
  shelfLabel,
  widthWithLid,
} from './inventory-computed-expressions';
import {
  adapterOverridden,
  adapterShelf,
  ankerDisplayName,
  cableUnavailable,
  chargerInsured,
  chargerLoading,
  chargerReplacement,
  chargerRequestError,
  dongleShelfDeleted,
  electronicsPickerItems,
  lampNeedsAttention,
  samplesDivideByZero,
  spareShelfUnavailable,
} from './inventory-computed-previews';

import type { ComputedScenario } from '@/kit/inventory/computed-editor/scenario';

const DECIMAL = { kind: 'decimal' } as const;
const SHORT_TEXT = { kind: 'short_text' } as const;

/** Replacement value loaded back from draft revision 13, unchanged. */
export const loadedReplacement: ComputedScenario = {
  context: electronicsContext,
  field: { label: 'Replacement value', type: DECIMAL, isNew: false },
  expression: replacementValue,
  selectedPath: 'expression',
  panel: 'node',
  policy: { allowOverride: true, publishedAllowOverride: true },
  save: 'saved',
  issues: [],
  preview: chargerReplacement,
  pickerItems: electronicsPickerItems,
  publish: 'mcp',
};

const edited: Partial<ComputedScenario> = { save: 'unsaved' };

function replacement(overrides: Partial<ComputedScenario>): ComputedScenario {
  return { ...loadedReplacement, ...overrides };
}

const newDisplayName: ComputedScenario = {
  ...loadedReplacement,
  field: { label: 'Display name', type: SHORT_TEXT, isNew: true },
  expression: emptyExpression,
  policy: { allowOverride: false },
  save: 'unsaved',
  preview: { state: 'no-expression' },
};

/** Every reviewable condition of the computed-field editor, keyed by state name. */
export const computedScenarios = {
  loaded: loadedReplacement,
  'new-field-empty': newDisplayName,
  'building-empty-slot': {
    ...newDisplayName,
    expression: displayNameInProgress,
    selectedPath: 'expression.right',
  },
  'text-and-literal': {
    ...newDisplayName,
    expression: displayName,
    selectedPath: 'expression.right.left',
    preview: ankerDisplayName,
  },
  'wrap-node': replacement({ ...edited, selectedPath: 'expression.values.1.left', panel: 'wrap' }),
  'read-follow-reference': replacement({
    ...edited,
    selectedPath: 'expression.values.1.left',
    followOpen: true,
  }),
  'read-two-references': {
    ...newDisplayName,
    field: { label: 'Shelf label', type: SHORT_TEXT, isNew: true },
    expression: shelfLabel,
    preview: adapterShelf,
  },
  'traversal-limit': {
    ...newDisplayName,
    field: { label: 'Shelf label', type: SHORT_TEXT, isNew: true },
    expression: shelfLabel,
    preview: adapterShelf,
    followOpen: true,
  },
  'if-condition': replacement({
    ...edited,
    field: { label: 'Insured value', type: DECIMAL, isNew: true },
    expression: insuredValue,
    policy: { allowOverride: false },
    preview: chargerInsured,
  }),
  'logic-and-or-not': replacement({
    ...edited,
    field: { label: 'Needs attention', type: { kind: 'boolean' }, isNew: true },
    expression: needsAttention,
    selectedPath: 'expression.right',
    policy: { allowOverride: false },
    preview: lampNeedsAttention,
  }),
  'choice-literal': replacement({
    ...edited,
    field: { label: 'Needs attention', type: { kind: 'boolean' }, isNew: true },
    expression: needsAttention,
    selectedPath: 'expression.left.right',
    policy: { allowOverride: false },
    preview: lampNeedsAttention,
  }),
  'arithmetic-divide': replacement({
    ...edited,
    field: { label: 'Per-unit saving', type: DECIMAL, isNew: true },
    expression: perUnitSaving,
    selectedPath: 'expression.right',
    policy: { allowOverride: false },
    preview: samplesDivideByZero,
  }),
  'measurement-literal': {
    ...newDisplayName,
    context: storageBoxContext,
    field: { label: 'Width with lid', type: { kind: 'measurement', unit: 'cm' }, isNew: true },
    expression: widthWithLid,
    selectedPath: 'expression.right',
    preview: { state: 'no-items', typeLabel: 'Storage box' },
    pickerItems: [],
  },
  'override-turned-off': replacement({
    ...edited,
    policy: { allowOverride: false, publishedAllowOverride: true, itemsWithOverride: 12 },
    preview: adapterOverridden,
  }),
  'field-not-on-every-target': replacement({
    save: 'refused',
    expression: replacementFromAnyType,
    selectedPath: 'expression.left',
    issues: [fieldUnknownIssue],
    preview: { state: 'invalid' },
  }),
  cycle: replacement({
    save: 'refused',
    expression: replacementValueCycle,
    issues: [cycleIssue],
    preview: { state: 'invalid' },
  }),
  'migration-required': replacement({ publish: 'migration-refused' }),
  'preview-loading': replacement({ preview: chargerLoading }),
  'preview-unavailable': replacement({ preview: cableUnavailable }),
  'preview-overridden-item': replacement({ preview: adapterOverridden }),
  'preview-unavailable-two-references': {
    ...newDisplayName,
    field: { label: 'Shelf label', type: SHORT_TEXT, isNew: true },
    expression: shelfLabel,
    preview: spareShelfUnavailable,
  },
  'preview-reference-deleted': {
    ...newDisplayName,
    field: { label: 'Shelf label', type: SHORT_TEXT, isNew: true },
    expression: shelfLabel,
    preview: dongleShelfDeleted,
  },
  'preview-request-error': replacement({ preview: chargerRequestError }),
  ...dimensionalScenarios(newDisplayName, replacement),
} satisfies Record<string, ComputedScenario>;

/** A state name of the computed-field editor screen. */
export type ComputedScenarioName = keyof typeof computedScenarios;
