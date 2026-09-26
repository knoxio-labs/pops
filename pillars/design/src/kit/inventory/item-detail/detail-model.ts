/**
 * What an item page reads: the shared row model plus the facts, provenance,
 * connections, documents, photos and recent history the aggregate adds, and
 * the page condition (a banner, a fact mid-edit, an open menu) a state puts
 * it in. Layouts never read fixtures; they read this.
 */
import type { EventModel, ItemRowModel, PlacementWorld } from '../foundation';
import type { PhotoItem } from '../photos/photo-item';

/** How a fact's value came to be, when it was not simply typed in. */
export type FactOrigin = 'entered' | 'calculated' | 'overridden' | 'missing-inputs';

/** One property of the item: a core fact (quantity, code) or a type field. */
export interface DetailFact {
  key: string;
  label: string;
  /** Rendered text, already formatted with its unit. Null reads as "Not set". */
  value: string | null;
  origin: FactOrigin;
  /** Inputs a computed value is waiting on, by label. */
  missingInputs?: readonly string[];
  /** Core facts cannot be edited inline: type, quantity and code open their own flows. */
  inline: boolean;
  /** Renders in mono (codes, serials). */
  mono?: boolean;
}

/** Where the item came from. Every part is optional; all empty folds the section. */
export interface DetailProvenance {
  purchasedOn: string | null;
  pricePaid: string | null;
  merchant: string | null;
  warrantyUntil: string | null;
  /** A linked purchase record in the Purchases pillar. */
  purchase: { id: string; label: string } | null;
}

/** One edge from this item: to another item or to a house fixture. */
export interface DetailConnection {
  id: string;
  target: 'item' | 'fixture';
  name: string;
  /** Literal relation, from this item's side: "Plugged into", "HDMI to". */
  relation: string;
  /** Where the other end is, one line. */
  where: string;
}

/** One Paperless document linked to the item. */
export interface DetailDocument {
  id: string;
  title: string;
  kind: 'Receipt' | 'Manual' | 'Warranty' | 'Insurance';
  added: string;
  /** Linked here but deleted in Paperless since. */
  missing?: boolean;
}

/** The Paperless link as the documents section sees it. */
export type PaperlessState = 'connected' | 'unreachable' | 'not-configured';

/** Everything an item page shows about one item. */
export interface ItemDetailModel {
  item: ItemRowModel;
  world: PlacementWorld;
  facts: readonly DetailFact[];
  provenance: DetailProvenance;
  connections: readonly DetailConnection[];
  documents: readonly DetailDocument[];
  paperless: PaperlessState;
  photos: readonly PhotoItem[];
  /** Newest first; the page shows a few and links to the full history. */
  events: readonly EventModel[];
  eventCount: number;
  /** For lifecycle banners: when and why it left active use. */
  lifecycleEvent?: EventModel;
}

/** A field whose edit the server refused, reverted in place with the reason. */
export interface FactRejection {
  key: string;
  reason: string;
}

/** A field changed here and elsewhere, shown as both values. */
export interface FieldConflict {
  label: string;
  mine: string;
  theirs: string;
  theirsBy: string;
}

/** The transient condition a state puts the page in. All optional; none is the calm page. */
export interface DetailCondition {
  banner?: 'stale' | 'offline' | 'needs-attention';
  conflict?: FieldConflict;
  editingKey?: string;
  editingDraft?: string;
  savingKey?: string;
  /** Saved optimistically, not yet acknowledged: the accent edge. */
  pendingKey?: string;
  rejection?: FactRejection;
  brokenPhoto?: boolean;
  menuOpen?: boolean;
  pickerOpen?: boolean;
  /** Section the stacked layout opens, or the tab the rail layout shows. */
  openSection?: DetailSectionId;
  toast?: {
    concept: 'move' | 'pickUp' | 'putBack' | 'retired' | 'discarded';
    message: string;
    state?: 'offered' | 'undone' | 'conflict';
  };
}

/** The sections an item page is made of, in reading order after photos and facts. */
export type DetailSectionId = 'connections' | 'documents' | 'provenance' | 'history';

/** How the page is laid out: the E1 question. Containers use the workspace either way. */
export type DetailLayout = 'stacked' | 'rail-tabs';
