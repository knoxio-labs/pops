import type {
  ConnectionsListForItemResponses,
  DocumentsListForItemResponses,
  ItemsGetResponses,
  LocationsGetPathResponses,
  PhotosListForItemResponses,
  WebGetResponses,
} from '../../inventory-api/types.gen.js';
import type { Lifecycle } from '../model/model';

/** The legacy item response used to fill fields not yet projected by web reads. */
export type LegacyItem = ItemsGetResponses[200]['data'];

/** The item aggregate returned by the web detail endpoint. */
export type WebItem = WebGetResponses[200]['item'];

/** One location ancestor from the location path endpoint. */
export type LocationNode = LocationsGetPathResponses[200]['data'][number];

/** One photo returned by the item photo endpoint. */
export type DetailPhoto = PhotosListForItemResponses[200]['data'][number];

/** One connection edge returned by the item connection endpoint. */
export type ItemConnection = ConnectionsListForItemResponses[200]['data'][number];

/** One Paperless link returned by the item document endpoint. */
export type LinkedDocument = DocumentsListForItemResponses[200]['data'][number];

/** How a displayed fact got its value. */
export type FactOrigin = 'entered' | 'calculated' | 'overridden' | 'missing-inputs';

/** A labelled item property ready for the facts rail. */
export interface DetailFact {
  key: string;
  label: string;
  value: string | null;
  origin: FactOrigin;
  missingInputs?: readonly string[];
  mono?: boolean;
}

/** The purchase and warranty information shown in Overview. */
export interface DetailProvenance {
  purchasedOn: string | null;
  pricePaid: string | null;
  merchant: string | null;
  warrantyUntil: string | null;
  purchaseTransactionId: string | null;
  purchaseSourceId: string | null;
}

/** A history row normalized from the web event envelope. */
export interface DetailHistoryEvent {
  id: string;
  kind: string;
  summary: string;
  at: string;
  actorName: string;
  before: string | null;
  after: string | null;
  reason: string | null;
  undoable: boolean;
}

/** Paperless availability as understood by the item page. */
export type PaperlessState = 'connected' | 'unreachable' | 'not-configured';

/** The complete read model consumed by the split item-detail layout. */
export interface ItemDetailAggregate {
  id: string;
  name: string;
  legacyItem: LegacyItem;
  lifecycle: Lifecycle;
  lifecycleChangedAt: string | null;
  quantity: number;
  isContainer: boolean;
  containerAccess: 'open' | 'closed' | null;
  containerFull: boolean | null;
  code: string | null;
  placementLabel: string;
  previousPlacementLabel: string | null;
  typeName: string | null;
  note: string | null;
  facts: readonly DetailFact[];
  provenance: DetailProvenance;
  photos: readonly DetailPhoto[];
  history: readonly DetailHistoryEvent[];
  eventCount: number;
  webItemDocumentCount: number;
  paperless: PaperlessState;
  hasProvenance: boolean;
  readOnly: boolean;
}

/** A stable section identifier used by both the tabs and Overview panes. */
export type DetailSectionId = 'provenance' | 'documents' | 'connections' | 'history';

/** The data needed to summarize the sections without rendering them. */
export interface DetailSectionCounts {
  documentCount: number;
  paperless: PaperlessState;
  connectionCount: number;
  historyCount: number;
  hasProvenance: boolean;
}

/** A section label and summary used for counts and tab state. */
export interface DetailSectionSummary {
  id: DetailSectionId;
  label: string;
  count: number | null;
  summary: string;
  flagged: boolean;
}
