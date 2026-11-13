import type {
  CraftActivity,
  CraftAccommodationGap,
  CraftFlight,
  CraftStay,
  CraftThought,
  CraftTimeline,
  CraftVisit,
} from '@/fixtures/trip-timeline-craft';

/** A source reveals details while the surrounding Timeline remains in place. */
export type CraftDetailSource = CraftFlight | CraftStay | CraftActivity | CraftVisit;

/** Explicit local source and gap actions used by Timeline rows. */
export interface CraftRowActions {
  onOpen: (source: CraftDetailSource) => void;
  onAddStay: (visit: CraftVisit, gap: CraftAccommodationGap) => void;
}

/** One contextual view, with a gap carrying its exact original Visit and interval. */
export type CraftPanel =
  | { kind: 'source'; source: CraftDetailSource }
  | { kind: 'documents' }
  | { kind: 'capture'; visitId?: string }
  | { kind: 'stay'; visitId: string; gap: CraftAccommodationGap };

/** A draft has a complete source context; an unplaced thought has no inferred Visit. */
export type ComposerContext = Extract<CraftPanel, { kind: 'capture' | 'stay' }>;

/** Exact composer text is preserved separately from the trimmed Timeline title. */
export interface ComposerDraft {
  id: string;
  context: ComposerContext;
  text: string;
}

/** A local preview entry retains its explicit optional Visit. */
export interface CraftLocalItem {
  visitId?: string;
  item: CraftThought | CraftStay;
}

/** One-level local Undo receipt; no production or uncertain-command authority. */
export interface CraftLocalReceipt {
  id: string;
  draft: ComposerDraft;
}

/** Local preview state retains every nonempty unsaved snapshot, including same-context versions. */
export interface CraftPreviewState {
  panel: CraftPanel | null;
  showIdeas: boolean;
  draft: ComposerDraft | null;
  savedDrafts: ComposerDraft[];
  items: CraftLocalItem[];
  lastAdded: CraftLocalReceipt | null;
  calendarOpen: boolean;
}

/** Timeline and date summary use the same explicit source visibility without hiding unknown states. */
export function visibleCraftRows(rows: CraftTimeline['rows'], showIdeas: boolean) {
  return rows.filter((row) => showIdeas || row.kind !== 'flight' || row.state !== 'Considering');
}
