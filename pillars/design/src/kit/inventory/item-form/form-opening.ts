/**
 * What an item form opens on: the draft, where it came from, and anything
 * already under way (photos, a save, an open picker). Review states are
 * openings; the form itself is live from there.
 */
import type { ComputedDisplay } from '../field-editors/computed-row';
import type { FormTypeDef } from '../field-editors/field-model';
import type { PlacementTarget } from '../shared/model';
import type { PlacementWorld } from '../shared/placement-model';
import type { TakenCodes } from './code-assist';
import type { ItemDraft } from './form-draft';
import type { PhotoUpload } from './photo-queue';

/** Something open over the form when it loads. */
export type FormOverlay =
  | { kind: 'cancel' }
  | { kind: 'place-picker' }
  | { kind: 'reference'; fieldId: string; query?: string };

/** A chooser state the playground opens over the item form. */
export interface TypePickerState {
  open: boolean;
  query?: string;
}

/** The item a save-and-new just created, for the confirmation line. */
export interface JustCreated {
  name: string;
  place: string;
  photos: number;
}

/** Everything an item form opens on. */
export interface ItemFormOpening {
  draft: ItemDraft;
  /** Where the form started, for "would leaving lose anything"; defaults to `draft`. */
  initial?: ItemDraft;
  /** Present when editing an existing item. */
  editing?: { id: string; name: string };
  computed?: Readonly<Record<string, ComputedDisplay>>;
  photos?: readonly PhotoUpload[];
  refusedPhotos?: readonly string[];
  phase?: 'editing' | 'saving' | 'save-failed';
  banner?: 'offline' | 'stale';
  justCreated?: JustCreated;
  overlay?: FormOverlay;
  typePicker?: TypePickerState;
}

/** The published catalogue and the house the form works against. */
export interface ItemFormContext {
  types: readonly FormTypeDef[];
  world: PlacementWorld;
  recents: readonly PlacementTarget[];
  taken: TakenCodes;
  /** What the suggester answers for a type id, or for no type. */
  suggest: (typeId: string | null) => string;
  typeLabel: (typeId: string) => string;
}
