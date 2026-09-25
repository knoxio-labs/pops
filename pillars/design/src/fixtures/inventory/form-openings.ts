/**
 * One opening per item form review state, and the context every state
 * shares: the published types, the house, recent places and taken codes.
 */
import { codeReducer } from '@/kit/inventory/item-form/code-assist';
import { blankDraft } from '@/kit/inventory/item-form/form-draft';

import { collidingCode, suggestedCodes, takenCodes, untypedSuggestion } from './code-suggestions';
import { coreWorld } from './core';
import {
  brokenDraft,
  cameraKitDraft,
  cameraMountsDraft,
  failedPhotos,
  headphonesDraft,
  labelPrinterDraft,
  printerCalculated,
  printerMissingInput,
  printerMissingInputs,
  printerNoCount,
  printerNoInputs,
  stagedPhotos,
  uploadingPhotos,
} from './form-scenarios';
import { formTypeLabel, formTypes } from './form-types';
import { recentPlacements } from './recents';

import type { CodeAction, CodeEntry } from '@/kit/inventory/item-form/code-assist';
import type { ItemDraft } from '@/kit/inventory/item-form/form-draft';
import type { ItemFormContext, ItemFormOpening } from '@/kit/inventory/item-form/form-opening';

/** What every item form state works against. */
export const formContext: ItemFormContext = {
  types: formTypes,
  world: coreWorld,
  recents: recentPlacements,
  taken: takenCodes,
  suggest: (typeId) => (typeId === null ? untypedSuggestion : (suggestedCodes[typeId] ?? 'H01')),
  typeLabel: formTypeLabel,
};

function withCode(draft: ItemDraft, ...actions: CodeAction[]): ItemDraft {
  const code: CodeEntry = actions.reduce(codeReducer, draft.code);
  return { ...draft, code };
}

const printer = { id: 'itm-printer', name: 'Label printer' };
const kitchen13 = { kind: 'container', containerId: 'box-k13' } as const;
const editPrinter = (draft: ItemDraft, extras: Partial<ItemFormOpening> = {}): ItemFormOpening => ({
  draft,
  initial: labelPrinterDraft,
  editing: printer,
  computed: { replacement_value: printerCalculated },
  ...extras,
});

/** Every review state's opening, by state name. */
export const formOpenings: Readonly<Record<string, ItemFormOpening>> = {
  'create-blank': { draft: blankDraft() },
  'create-typed': { draft: headphonesDraft },
  'create-in-container': {
    draft: { ...blankDraft(kitchen13, 'type-kitchen'), name: 'Milk frother' },
    initial: blankDraft(kitchen13),
  },
  'create-in-hand': {
    draft: { ...blankDraft(undefined, 'type-cable'), name: 'USB-C to HDMI adapter' },
  },
  'create-container': {
    draft: withCode(
      {
        ...blankDraft({ kind: 'location', locationId: 'loc-kitchen' }, 'type-box'),
        name: 'Kitchen 14',
      },
      { type: 'suggested', suggestion: 'K14' }
    ),
  },
  'destination-picker': { draft: headphonesDraft, overlay: { kind: 'place-picker' } },
  edit: editPrinter(labelPrinterDraft),
  'kinds-many': {
    draft: cameraKitDraft,
    editing: { id: 'itm-xt5', name: 'Fujifilm X-T5 kit' },
  },
  'enums-many': { draft: cameraMountsDraft },
  references: editPrinter(labelPrinterDraft, {
    overlay: { kind: 'reference', fieldId: 'stored_with', query: 'desk' },
  }),
  'code-suggested': {
    draft: withCode(headphonesDraft, { type: 'suggested', suggestion: 'E14' }),
  },
  'code-editing': {
    draft: withCode(
      headphonesDraft,
      { type: 'typed', value: 'HP-01' },
      { type: 'checked', taken: takenCodes }
    ),
  },
  'code-collision': {
    draft: withCode(
      { ...headphonesDraft, name: 'Label printer, spare' },
      { type: 'typed', value: collidingCode },
      { type: 'checked', taken: takenCodes }
    ),
  },
  'code-unavailable': {
    draft: withCode(headphonesDraft, { type: 'suggest-failed', reason: 'unavailable' }),
  },
  'computed-calculated': editPrinter(labelPrinterDraft),
  'computed-overridden': editPrinter({
    ...labelPrinterDraft,
    overrides: { replacement_value: '150.00' },
  }),
  'computed-missing-input': editPrinter(printerNoCount, {
    computed: { replacement_value: printerMissingInput },
  }),
  'computed-missing-inputs': editPrinter(printerNoInputs, {
    computed: { replacement_value: printerMissingInputs },
  }),
  'type-change-warning': editPrinter({ ...labelPrinterDraft, typeId: 'type-cable' }),
  'validation-errors': { draft: brokenDraft },
  'photos-pending': { draft: headphonesDraft, photos: stagedPhotos },
  saving: { draft: headphonesDraft, photos: uploadingPhotos, phase: 'saving' },
  'save-failed': { draft: headphonesDraft, photos: stagedPhotos, phase: 'save-failed' },
  'photo-upload-failed': editPrinter(labelPrinterDraft, { photos: failedPhotos }),
  'cancel-dirty': { draft: headphonesDraft, photos: stagedPhotos, overlay: { kind: 'cancel' } },
  'save-and-new': {
    draft: blankDraft({ kind: 'location', locationId: 'loc-desk' }, 'type-electronics'),
    justCreated: { name: 'Noise-cancelling headphones', place: 'Desk', photos: 3 },
  },
  offline: {
    draft: withCode(headphonesDraft, { type: 'suggest-failed', reason: 'offline' }),
    banner: 'offline',
  },
  stale: editPrinter(labelPrinterDraft, { banner: 'stale' }),
};
