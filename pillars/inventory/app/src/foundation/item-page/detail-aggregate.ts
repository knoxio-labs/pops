import { buildDetailFacts, buildDetailProvenance, detailTextValue } from './detail-facts';
import { identityFields } from './detail-identity';

import type { WebGetResponses } from '../../inventory-api/types.gen.js';
import type { Lifecycle } from '../model/model';
import type {
  DetailHistoryEvent,
  DetailPhoto,
  ItemDetailAggregate,
  LegacyItem,
  LocationNode,
  WebItem,
} from './detail-types';

const LIFECYCLES: readonly Lifecycle[] = ['active', 'retired', 'discarded', 'lost', 'destroyed'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isLifecycle(value: string | undefined): value is Lifecycle {
  return value !== undefined && LIFECYCLES.some((lifecycle) => lifecycle === value);
}

function normaliseLifecycle(value: string | undefined): Lifecycle {
  return isLifecycle(value) ? value : 'active';
}

function titleCase(value: string): string {
  return value
    .replaceAll(/([a-z])([A-Z])/g, '$1 $2')
    .replaceAll(/[_-]+/g, ' ')
    .replaceAll(/\s+/g, ' ')
    .trim()
    .replace(/^./, (first) => first.toUpperCase());
}

function placementLabel(
  webItem: WebItem | undefined,
  legacyItem: LegacyItem,
  locationPath: readonly LocationNode[]
): string {
  const placement = webItem?.placement;
  if (placement?.kind === 'hand') return 'In hand';
  if (placement?.kind === 'container') return `Inside ${placement.itemId}`;
  if (placement?.kind === 'location') {
    const last = locationPath.at(-1);
    return last?.name ?? legacyItem.location ?? 'Location assigned';
  }
  return legacyItem.location ?? 'No location assigned';
}

function previousPlacementLabel(webItem: WebItem | undefined): string | null {
  const placement = webItem?.previousPlacement;
  if (placement === null || placement === undefined) return null;
  if (placement.kind === 'container') return `Inside ${placement.itemId}`;
  return `Location ${placement.locationId}`;
}

function displayEventValue(snapshot: Record<string, unknown>): string | null {
  const placement = snapshot.placement;
  if (isRecord(placement)) {
    const kind = placement.kind;
    if (kind === 'hand') return 'In hand';
    if (kind === 'location' && typeof placement.locationId === 'string') {
      return `Location ${placement.locationId}`;
    }
    if (kind === 'container' && typeof placement.itemId === 'string') {
      return `Inside ${placement.itemId}`;
    }
  }
  for (const key of ['name', 'value', 'lifecycle', 'code', 'quantity', 'locationId']) {
    const value = detailTextValue(snapshot[key]);
    if (value !== null) return value;
  }
  return null;
}

function eventSummary(kind: string, after: Record<string, unknown>): string {
  if (kind === 'lifecycle_changed') {
    const lifecycle = detailTextValue(after.lifecycle);
    if (lifecycle === null) return 'Lifecycle changed';
    return titleCase(lifecycle);
  }
  const summaries: Readonly<Record<string, string>> = {
    created: 'Created',
    deleted: 'Deleted',
    edited: 'Details changed',
    moved: 'Moved',
    picked_up: 'Picked up',
    put_back: 'Put back',
    code_set: 'Code set',
    quantity_changed: 'Quantity changed',
    photo_added: 'Photo added',
    photo_removed: 'Photo removed',
    connected: 'Connected',
    disconnected: 'Disconnected',
  };
  return summaries[kind] ?? titleCase(kind);
}

type HistoryEvent = WebGetResponses[200]['history']['events'][number];

function buildHistoryRows(history: readonly HistoryEvent[]): DetailHistoryEvent[] {
  return history.map((event) => ({
    id: `${event.entityKind}-${event.entityId}-${event.seq}`,
    kind: event.kind,
    summary: eventSummary(event.kind, event.after),
    at: event.serverTime,
    actorName: event.actor.label,
    before: displayEventValue(event.before),
    after: displayEventValue(event.after),
    reason: event.reason,
    undoable: event.undoable,
  }));
}

function withWebLocation(legacyItem: LegacyItem, webItem?: WebItem): LegacyItem {
  const location = webItem?.placement.kind === 'location' ? webItem.placement.locationId : null;
  if (location === null || legacyItem.locationId !== null) return legacyItem;
  return { ...legacyItem, locationId: location };
}

function hasProvenance(legacyItem: LegacyItem): boolean {
  return [
    legacyItem.purchaseDate,
    legacyItem.purchasePrice,
    legacyItem.purchasedFromId,
    legacyItem.purchasedFromName,
    legacyItem.warrantyExpires,
    legacyItem.purchaseTransactionId,
  ].some((value) => value !== null);
}

function paperlessState(webItem?: WebItem): ItemDetailAggregate['paperless'] {
  if (webItem?.documentsStatus === 'unavailable') return 'unreachable';
  if (webItem !== undefined) return 'connected';
  return 'not-configured';
}

interface AggregateInput {
  legacyItem: LegacyItem;
  webItem?: WebItem;
  locationPath: readonly LocationNode[];
  photos: readonly DetailPhoto[];
  history: readonly HistoryEvent[];
}

function supportingFields(
  legacyItem: LegacyItem,
  webItem: WebItem | undefined,
  photos: readonly DetailPhoto[],
  historyRows: readonly DetailHistoryEvent[]
): Pick<
  ItemDetailAggregate,
  'facts' | 'provenance' | 'photos' | 'history' | 'eventCount' | 'webItemDocumentCount'
> {
  return {
    facts: buildDetailFacts(legacyItem, webItem),
    provenance: buildDetailProvenance(legacyItem, webItem),
    photos,
    history: historyRows,
    eventCount: historyRows.length,
    webItemDocumentCount: webItem?.documentTitles.length ?? 0,
  };
}

function statusFields(
  legacyItem: LegacyItem,
  webItem: WebItem | undefined
): Pick<ItemDetailAggregate, 'hasProvenance' | 'paperless'> {
  return {
    paperless: paperlessState(webItem),
    hasProvenance: hasProvenance(legacyItem),
  };
}

/** Builds the page aggregate from the compatible legacy and web reads. */
export function buildItemDetailAggregate({
  legacyItem,
  webItem,
  locationPath,
  photos,
  history,
}: AggregateInput): ItemDetailAggregate {
  const resolvedLegacyItem = withWebLocation(legacyItem, webItem);
  const lifecycle = normaliseLifecycle(webItem?.lifecycle);
  const historyRows = buildHistoryRows(history);
  return {
    legacyItem: resolvedLegacyItem,
    placementLabel: placementLabel(webItem, resolvedLegacyItem, locationPath),
    previousPlacementLabel: previousPlacementLabel(webItem),
    ...identityFields(resolvedLegacyItem, webItem, lifecycle),
    ...supportingFields(resolvedLegacyItem, webItem, photos, historyRows),
    ...statusFields(resolvedLegacyItem, webItem),
  };
}
