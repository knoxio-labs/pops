import { storageBoxContext } from './inventory-computed-catalogue';
import {
  boxVolume,
  boxVolumeInProgress,
  dimensionMismatchExpression,
  dimensionMismatchIssue,
} from './inventory-computed-expressions';
import {
  chargerPrecisionOverflow,
  movingCrate,
  movingCrateVolume,
  samplesAllInputsMissing,
} from './inventory-computed-previews';

import type { ComputedScenario } from '@/kit/inventory/computed-editor/scenario';

const VOLUME_LITERS = { kind: 'measurement', unit: 'L' } as const;
const VOLUME_SQUARE_CM = { kind: 'measurement', unit: 'cm²' } as const;

/**
 * Expression v2's dimensional measurement units (Inventory ADR-002 D5),
 * built on the same brand-new-display-name and replacement-value bases the
 * rest of the screen uses: a product derives its own unit, a computed
 * field's fixed unit converts a same-dimension result into it, and different
 * dimensions never combine.
 */
export function dimensionalScenarios(
  newDisplayName: ComputedScenario,
  replacement: (overrides: Partial<ComputedScenario>) => ComputedScenario
): Record<string, ComputedScenario> {
  return {
    'dimensional-building': {
      ...newDisplayName,
      context: storageBoxContext,
      field: { label: 'Volume', type: VOLUME_LITERS, isNew: true },
      expression: boxVolumeInProgress,
      selectedPath: 'expression.right',
      panel: 'insert',
      preview: { state: 'no-expression' },
      pickerItems: [],
    },
    'dimensional-picker-filters-measurements': {
      ...newDisplayName,
      context: storageBoxContext,
      field: { label: 'Volume', type: VOLUME_LITERS, isNew: true },
      expression: boxVolume,
      selectedPath: 'expression.right',
      preview: { state: 'no-items', typeLabel: 'Storage box' },
      pickerItems: [],
    },
    'dimensional-volume-preview': {
      ...newDisplayName,
      context: storageBoxContext,
      field: { label: 'Volume', type: VOLUME_LITERS, isNew: true },
      expression: boxVolume,
      save: 'saved',
      preview: movingCrateVolume,
      pickerItems: [movingCrate],
    },
    'dimension-mismatch': {
      ...newDisplayName,
      context: storageBoxContext,
      field: { label: 'Volume', type: VOLUME_SQUARE_CM, isNew: true },
      expression: dimensionMismatchExpression,
      selectedPath: dimensionMismatchIssue.path,
      save: 'refused',
      issues: [dimensionMismatchIssue],
      preview: { state: 'invalid' },
      pickerItems: [],
    },
    'preview-precision-overflow': replacement({ preview: chargerPrecisionOverflow }),
    'preview-unavailable-many-missing': replacement({ preview: samplesAllInputsMissing }),
  };
}
