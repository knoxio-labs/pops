import type { CatalogueType } from '../../catalogue-editor/types';
import type { EventModel, ItemRowModel } from '../../foundation/model/model';
import type { PlacementWorld } from '../../foundation/model/placement-model';
import type { WebGetResponse } from '../../inventory-api/types.gen.js';

/** The source of a fact's displayed value. */
export type FactOrigin = 'entered' | 'calculated' | 'overridden' | 'missing-inputs';

/** One read-only fact in the item facts rail. */
export interface DetailFact {
  /** Catalogue fields use their stable key; Quantity uses `quantity`. */
  key: string;
  label: string;
  value: string | null;
  origin: FactOrigin;
  missingInputs?: readonly string[];
  inline: boolean;
  mono?: boolean;
}

/** Purchase and warranty information shown on Overview. */
export interface DetailProvenance {
  purchasedOn: string | null;
  pricePaid: string | null;
  merchant: string | null;
  warrantyUntil: string | null;
  purchase: { href: string; label: string } | null;
}

/** One connection to another inventory item or a fixed fixture. */
export interface DetailConnection {
  id: string;
  target: 'item' | 'fixture';
  name: string;
  relation: string;
  where: string;
  farId: string;
}

/** One Paperless document linked to the item. */
export interface DetailDocument {
  id: number;
  title: string;
  kind: string;
  added: string;
  paperlessDocumentId: number;
  /** Whether Paperless no longer has the linked document. */
  missing: boolean;
}

/** Availability of the Paperless integration. */
export type PaperlessState = 'connected' | 'unreachable' | 'not-configured';

/** One media-backed item photo. */
export interface DetailPhoto {
  /** The wire photo's sha256 is its stable id. */
  id: string;
  url: string;
  thumbUrl: string;
  caption: string | null;
}

/** The complete read model consumed by the item-detail view. */
export interface ItemDetailModel {
  item: ItemRowModel;
  /** The primary placement read; related items never enter this world. */
  world: PlacementWorld;
  /** Primary placement data plus graph/reference items used to name values. */
  relatedWorld: PlacementWorld;
  /** Null until the web aggregate answers. */
  aggregate: {
    facts: readonly DetailFact[];
    type: CatalogueType | null;
    fieldValues: WebGetResponse['item']['fieldValues'];
    provenance: DetailProvenance;
    photos: readonly DetailPhoto[];
  } | null;
  documents: readonly DetailDocument[] | null;
  paperless: PaperlessState | null;
  paperlessBaseUrl: string | null;
  connections: readonly DetailConnection[] | null;
  /** Empty until the history-row ticket supplies the preview rows. */
  events: readonly EventModel[];
  eventCount: number | null;
}

/** A section that can be shown below the facts rail. */
export type DetailSectionId = 'connections' | 'documents' | 'provenance' | 'history';

/** The URL-backed tabs, including the folded tablet-only Facts tab. */
export type DetailTab = 'facts' | 'overview' | 'connections' | 'history';
