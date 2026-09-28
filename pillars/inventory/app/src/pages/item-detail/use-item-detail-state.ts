import {
  paperlessStateOf,
  toDetailConnections,
  toDetailDocuments,
  toDetailFacts,
  toDetailPhotos,
  toDetailProvenance,
} from './detail-model';

import type { CatalogueType } from '../../catalogue-editor/types';
import type { ItemRowModel } from '../../foundation/model/model';
import type {
  ConnectionsGraphResponse,
  FixturesListForItemResponse,
  FixturesListResponse,
  WebGetResponse,
} from '../../inventory-api/types.gen.js';
import type { ItemDetailModel } from './detail-model';
import type { AuxiliaryQueries, ConnectionSources } from './detail-read-queries';

/** The banner states that can appear after the item itself is available. */
export type ItemDetailBannerState = 'partial' | 'unavailable' | 'error';

/** Read signals used to distinguish incomplete data from an unavailable read. */
export interface ItemDetailReadSignals {
  readonly hasPending: boolean;
  readonly hasUnavailable: boolean;
  readonly hasError: boolean;
}

const EMPTY_GRAPH: ConnectionsGraphResponse['data'] = { edges: [], nodes: [] };

/** Applies pending-sync presentation to the primary item without mutating query data. */
export function displayItem(
  item: ItemRowModel | undefined,
  pendingIds: ReadonlySet<string>
): ItemRowModel | null {
  if (item === undefined) return null;
  return pendingIds.has(item.id) ? { ...item, sync: 'sending' } : item;
}

interface ConnectionModelInput {
  id: string;
  graph: ConnectionsGraphResponse['data'] | undefined;
  fixtureLinks: FixturesListForItemResponse['data'] | undefined;
  fixtures: FixturesListResponse['data'] | undefined;
  world: ItemDetailModel['relatedWorld'];
}

function connectionModel({ id, graph, fixtureLinks, fixtures, world }: ConnectionModelInput) {
  return toDetailConnections(id, graph ?? EMPTY_GRAPH, fixtureLinks ?? [], fixtures ?? [], world);
}

/** Maps the web item aggregate into the detail model's facts, provenance, and photos. */
export function aggregateFor(
  item: WebGetResponse['item'] | null,
  type: CatalogueType | null,
  relatedWorld: ItemDetailModel['relatedWorld']
): ItemDetailModel['aggregate'] {
  if (item === null) return null;
  return {
    facts: toDetailFacts(item, type, relatedWorld),
    type,
    fieldValues: item.fieldValues,
    provenance: toDetailProvenance(item.provenance),
    photos: toDetailPhotos(item.photos),
  };
}

/** Maps document query data while keeping the section loading state explicit. */
export function documentsFor(query: AuxiliaryQueries['documentsQuery']) {
  if (query.isPending) return null;
  return toDetailDocuments(query.data?.data ?? []);
}

/** Maps Paperless availability data while keeping the section loading state explicit. */
export function paperlessFor(query: AuxiliaryQueries['paperlessQuery']) {
  if (query.isPending) return null;
  return paperlessStateOf(query.data?.data ?? null);
}

/** Maps connection reads into the detail model once all required lists are available. */
export function connectionsFor(
  id: string,
  sources: ConnectionSources,
  auxiliary: AuxiliaryQueries
) {
  const { graphQuery } = sources;
  if (
    graphQuery.isPending ||
    auxiliary.fixtureLinksQuery.isPending ||
    auxiliary.fixturesQuery.isPending
  ) {
    return null;
  }
  return connectionModel({
    id,
    graph: graphQuery.data?.data,
    fixtureLinks: auxiliary.fixtureLinksQuery.data?.data,
    fixtures: auxiliary.fixturesQuery.data?.data,
    world: sources.relatedWorld,
  });
}

interface BuildModelInput {
  baseItem: ItemRowModel | null;
  primaryWorld: ItemDetailModel['world'];
  relatedWorld: ItemDetailModel['relatedWorld'];
  aggregate: ItemDetailModel['aggregate'];
  documents: ItemDetailModel['documents'];
  paperless: ItemDetailModel['paperless'];
  paperlessBaseUrl: string | null;
  connections: ItemDetailModel['connections'];
  events: ItemDetailModel['events'];
  eventCount: number | null;
}

/** Assembles the read results into the page's immutable detail model. */
export function buildModel(input: BuildModelInput): ItemDetailModel | null {
  if (input.baseItem === null) return null;
  return {
    item: input.baseItem,
    world: input.primaryWorld,
    relatedWorld: input.relatedWorld,
    aggregate: input.aggregate,
    documents: input.documents,
    paperless: input.paperless,
    paperlessBaseUrl: input.paperlessBaseUrl,
    connections: input.connections,
    events: input.events,
    eventCount: input.eventCount,
  };
}

/** Returns the loaded-item banner state without replacing the detail surface. */
export function itemDetailBannerState(
  model: ItemDetailModel | null,
  signals: ItemDetailReadSignals
): ItemDetailBannerState | null {
  if (model === null) return null;
  if (signals.hasError) return 'error';
  if (signals.hasUnavailable) return 'unavailable';
  if (
    signals.hasPending ||
    model.aggregate === null ||
    model.documents === null ||
    model.paperless === null ||
    model.connections === null ||
    model.eventCount === null
  ) {
    return 'partial';
  }
  return null;
}

/** Derives the page read state from the primary identifier, query error, and model. */
export function statusFor(
  id: string,
  notFound: boolean,
  error: unknown | null,
  model: ItemDetailModel | null
) {
  if (id.length === 0 || notFound) return 'not-found' as const;
  if (error !== null) return 'error' as const;
  if (model === null) return 'loading' as const;
  return 'ready' as const;
}

interface RetryInput {
  id: string;
  detailQuery: { refetch: () => Promise<unknown> };
  sources: ConnectionSources;
  auxiliary: AuxiliaryQueries;
  events: { refetch: () => void };
}

/** Refetches every read used by the detail page after an error state. */
export function retryReads(input: RetryInput): void {
  if (input.id.length === 0) return;
  void Promise.all([
    input.detailQuery.refetch(),
    input.sources.primary.locationsQuery.refetch(),
    input.sources.primary.openContainersQuery.refetch(),
    input.sources.primary.closedContainersQuery.refetch(),
    input.sources.primary.subjectItemsQuery.refetch(),
    input.sources.related.locationsQuery.refetch(),
    input.sources.related.openContainersQuery.refetch(),
    input.sources.related.closedContainersQuery.refetch(),
    input.sources.related.subjectItemsQuery.refetch(),
    input.auxiliary.documentsQuery.refetch(),
    input.auxiliary.paperlessQuery.refetch(),
    input.sources.graphQuery.refetch(),
    input.auxiliary.fixtureLinksQuery.refetch(),
    input.auxiliary.fixturesQuery.refetch(),
    input.events.refetch(),
  ]);
}
