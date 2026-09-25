import * as records from '@/fixtures/inventory/sync-cases';
import * as catalogue from '@/fixtures/inventory/sync-catalogue-cases';
import { activityStates, ledgerStates, repairState } from '@/kit/inventory/sync/sync-states';

import type { ScreenMeta, ScreenStates } from '@/contract';

export const meta: ScreenMeta = { title: 'Sync', order: 80, frame: 'web' };

const activity = Object.fromEntries(
  Object.entries(activityStates).map(([name, state]) => [
    name === 'default' ? 'activity' : `activity-${name}`,
    state,
  ])
);

/**
 * `/inventory/sync`: the Activity segment (what happened) and the Sync
 * segment (what needs a person), with one state per repair case a phone
 * can report, the outcomes, and the two web interruptions.
 */
export const states: ScreenStates = {
  ...ledgerStates,
  'repair-placement': repairState(records.placementCase),
  'repair-field': repairState(records.fieldCase),
  'repair-code-collision': repairState(records.codeCase),
  'repair-deleted-elsewhere': repairState(records.deletedCase),
  'repair-photo-failed': repairState(records.photoCase),
  'repair-catalogue-updating': repairState(catalogue.updatingCase),
  'repair-field-archived': repairState(catalogue.archivedCase),
  'repair-type-replaced': repairState(catalogue.typeReplacedCase),
  'repair-option-retired': repairState(catalogue.optionRetiredCase),
  'repair-now-required': repairState(catalogue.nowRequiredCase),
  'repair-fields-not-here': repairState(catalogue.fieldsNotHereCase),
  'repair-stale-reference-gone': repairState(catalogue.referenceGoneCase),
  'repair-stale-reference-not-allowed': repairState(catalogue.referenceNotAllowedCase),
  'repair-retry-refused': repairState(catalogue.refusedCase),
  ...activity,
};

export default ledgerStates.attention ?? (() => null);
