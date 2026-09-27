import { describeValues, isRepairKind, valuesThatFit } from '../sync-model.js';

import type { HeldValue, RepairActionId, RepairCase, RepairKind } from '../sync-model.js';

/** One action the web can offer for a repair case. */
export interface WebAction {
  id: RepairActionId;
  label: string;
}

/** The web action plan and the choice that remains on the device. */
export interface RepairPlan {
  primary: (WebAction & { outcome: string }) | null;
  secondary: readonly WebAction[];
  onDevice: string | null;
}

const CLOSE_EITHER = 'Both copies then match, so either choice on the device closes the case.';

function fitting(repair: RepairCase): HeldValue[] {
  return valuesThatFit(repair.held?.values ?? []);
}

function openItem(repair: RepairCase): WebAction {
  return { id: 'open-item', label: `Open ${repair.itemName}` };
}

function saveFitting(repair: RepairCase, device: string): RepairPlan['primary'] {
  const values = fitting(repair);
  if (values.length === 0) return null;
  return {
    id: 'save-fitting',
    label: `Save ${describeValues(values)} here`,
    outcome: `Saves what still fits. Then choose Let go on ${device}; nothing else is lost.`,
  };
}

type Planner = (repair: RepairCase, device: string) => RepairPlan;

const conflict: Planner = (repair, device) => ({
  primary: repair.mine
    ? {
        id: 'use-mine',
        label:
          repair.kind === 'placement' ? `Move to ${repair.mine.value}` : `Use ${repair.mine.value}`,
        outcome: CLOSE_EITHER,
      }
    : null,
  secondary: [openItem(repair)],
  onDevice: `To keep ${repair.theirs?.value ?? 'the saved value'}, choose Discard mine on ${device}.`,
});

const PLANNERS: Readonly<Record<RepairKind, Planner>> = {
  placement: conflict,
  field: conflict,
  'code-collision': (repair, device) => ({
    primary: repair.code
      ? {
          id: 'use-suggested',
          label: `Use code ${repair.code.suggested}`,
          outcome: `${CLOSE_EITHER} Print the new label afterwards.`,
        }
      : null,
    secondary: [{ id: 'open-holder', label: `Open ${repair.code?.holder ?? 'the holder'}` }],
    onDevice: `Or choose New code or Discard mine on ${device}.`,
  }),
  'deleted-elsewhere': (repair, device) => ({
    primary: {
      id: 'restore',
      label: `Restore ${repair.itemName}`,
      outcome: `It returns with its history. Choose Restore on ${device} to send the held change.`,
    },
    secondary: [],
    onDevice: `To leave it deleted, choose Let go on ${device}.`,
  }),
  'photo-failed': (repair, device) => ({
    primary: {
      id: 'upload',
      label: 'Upload a photo from this computer',
      outcome: `Adds the photo here. Then choose Remove on ${device} so it stops retrying.`,
    },
    secondary: [openItem(repair)],
    onDevice: `Or choose Retry or Remove on ${device}.`,
  }),
  'catalogue-updating': (repair, device) => ({
    primary: null,
    secondary: [openItem(repair)],
    onDevice: `Nothing to do. ${device} sends its held changes once the download finishes.`,
  }),
  'field-archived': (repair, device) => ({
    primary: saveFitting(repair, device),
    secondary: [{ id: 'open-type', label: 'Open the type' }],
    onDevice: `Or choose Edit item on ${device} and redo the change against the current fields.`,
  }),
  'type-replaced': (repair, device) => ({
    primary: {
      id: 'change-type',
      label: `Change type to ${repair.held?.values[0]?.replacement ?? 'the replacement'}`,
      outcome: `Carries over ${describeValues(fitting(repair))}. Then choose Let go on ${device}.`,
    },
    secondary: [openItem(repair)],
    onDevice: `Or choose Edit item on ${device}.`,
  }),
  'option-retired': (repair, device) => ({
    primary: saveFitting(repair, device),
    secondary: [{ id: 'choose-option', label: 'Choose another option' }],
    onDevice: `Or choose Edit item on ${device} and pick a current option.`,
  }),
  'now-required': (repair, device) => ({
    primary: null,
    secondary: [{ id: 'open-type', label: 'Open the type' }],
    onDevice: `${repair.itemName} exists only on ${device} until it is sent. Choose Edit item there and fill in the required field.`,
  }),
  'fields-not-here': (_repair, device) => ({
    primary: null,
    secondary: [],
    onDevice: `Nothing to do. ${device} sends this once it downloads the newer fields.`,
  }),
  'stale-reference-gone': (repair, device) => ({
    primary: {
      id: 'restore-reference',
      label: `Restore ${repair.held?.values.find((value) => value.fit === 'record-gone')?.value ?? 'the record'}`,
      outcome: `Then choose Retry on ${device} and the change is sent as it was.`,
    },
    secondary: [{ id: 'save-fitting', label: `Save ${describeValues(fitting(repair))} only` }],
    onDevice: `Or choose Edit item or Let go on ${device}.`,
  }),
  'stale-reference-not-allowed': (repair, device) => ({
    primary: saveFitting(repair, device),
    secondary: [{ id: 'open-type', label: 'Open the field in its type' }],
    onDevice: `Or choose Edit item on ${device} and link a record the field allows.`,
  }),
};

/** Returns the actions the web can offer and the decision left to the device. */
export function planFor(repair: RepairCase, device: string): RepairPlan {
  if (!isRepairKind(repair.kind)) {
    return {
      primary: null,
      secondary: [openItem(repair)],
      onDevice: null,
    };
  }
  return PLANNERS[repair.kind](repair, device);
}
