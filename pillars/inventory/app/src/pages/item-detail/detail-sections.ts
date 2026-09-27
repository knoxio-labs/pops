import { resolveUri } from '@pops/navigation';

import { locationPath, placementTrail } from '../../foundation/model/placement-model';

import type { EventModel } from '../../foundation/model/model';
import type { PlacementWorld } from '../../foundation/model/placement-model';
import type {
  ConnectionsGraphResponse,
  DocumentsListForItemResponse,
  FixturesListForItemResponse,
  FixturesListResponse,
  WebGetResponse,
} from '../../inventory-api/types.gen.js';
import type {
  DetailConnection,
  DetailDocument,
  DetailPhoto,
  DetailProvenance,
  PaperlessState,
} from './detail-model-types';

function longDate(value: string | null): string | null {
  if (value === null) return null;
  return new Intl.DateTimeFormat('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
}

function price(value: number | null): string | null {
  if (value === null) return null;
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(value);
}

/** Maps purchase and warranty data to the display format used by Overview. */
export function toDetailProvenance(
  provenance: WebGetResponse['item']['provenance']
): DetailProvenance {
  if (provenance === null) {
    return {
      purchasedOn: null,
      pricePaid: null,
      merchant: null,
      warrantyUntil: null,
      purchase: null,
    };
  }
  const href = provenance.transactionUri === null ? null : resolveUri(provenance.transactionUri);
  let purchase: DetailProvenance['purchase'] = null;
  if (href !== null) {
    purchase = {
      href,
      label: provenance.merchant ? `Purchase from ${provenance.merchant}` : 'Purchase',
    };
  }
  return {
    purchasedOn: longDate(provenance.purchasedOn),
    pricePaid: price(provenance.price),
    merchant: provenance.merchant,
    warrantyUntil: longDate(provenance.warrantyExpires),
    purchase,
  };
}

function titleCase(value: string): string {
  return value
    .replaceAll(/[_-]+/g, ' ')
    .replaceAll(/\s+/g, ' ')
    .trim()
    .replace(/^./, (first) => first.toUpperCase());
}

/** Maps linked document rows into the detail model. */
export function toDetailDocuments(rows: DocumentsListForItemResponse['data']): DetailDocument[] {
  return rows.map((row) => ({
    id: row.id,
    title: row.title ?? `Document #${row.paperlessDocumentId}`,
    kind: titleCase(row.documentType),
    added: longDate(row.createdAt) ?? row.createdAt,
    paperlessDocumentId: row.paperlessDocumentId,
  }));
}

/** Maps the Paperless status response into the three page states. */
export function paperlessStateOf(
  status: { configured: boolean; available: boolean } | null
): PaperlessState {
  if (status === null || !status.configured) return 'not-configured';
  return status.available ? 'connected' : 'unreachable';
}

/** Builds the medium and thumbnail media URLs from the photo sha256. */
export function toDetailPhotos(photos: WebGetResponse['item']['photos']): DetailPhoto[] {
  return photos.map((photo) => ({
    id: photo.sha256,
    url: `/inventory-api/media/${photo.sha256}?variant=medium`,
    thumbUrl: `/inventory-api/media/${photo.sha256}?variant=thumb`,
    caption: photo.caption,
  }));
}

function itemWhere(world: PlacementWorld, itemId: string): string {
  const item = world.items.get(itemId);
  if (item === undefined) return 'Unknown place';
  return placementTrail(world, item.placement)
    .map((segment) => segment.name)
    .join(' › ');
}

function fixtureWhere(world: PlacementWorld, locationId: string | null): string {
  if (locationId === null) return '';
  return locationPath(world, locationId)
    .map((location) => location.name)
    .join(' › ');
}

interface ConnectionContext {
  itemId: string;
  graph: ConnectionsGraphResponse['data'];
  fixtureLinks: FixturesListForItemResponse['data'];
  fixtures: FixturesListResponse['data'];
  relatedWorld: PlacementWorld;
}

function farIdForEdge(
  itemId: string,
  edge: ConnectionsGraphResponse['data']['edges'][number]
): string | null {
  if (edge.source === itemId) return edge.target;
  if (edge.target === itemId) return edge.source;
  return null;
}

function itemConnections(context: ConnectionContext): DetailConnection[] {
  const nodes = new Map(context.graph.nodes.map((node) => [node.id, node]));
  const fixtureIds = new Set(context.fixtureLinks.map((link) => link.fixtureId));
  const seenItems = new Set<string>();
  const connections: DetailConnection[] = [];
  for (const edge of context.graph.edges) {
    const farId = farIdForEdge(context.itemId, edge);
    if (
      farId === null ||
      farId === context.itemId ||
      fixtureIds.has(farId) ||
      nodes.get(farId)?.isFixture === true ||
      seenItems.has(farId)
    ) {
      continue;
    }
    seenItems.add(farId);
    connections.push({
      id: `item:${farId}`,
      target: 'item',
      name:
        nodes.get(farId)?.itemName ?? context.relatedWorld.items.get(farId)?.name ?? 'Unknown item',
      relation: 'Connected to',
      where: itemWhere(context.relatedWorld, farId),
      farId,
    });
  }
  return connections;
}

function fixtureConnections(context: ConnectionContext): DetailConnection[] {
  const fixtureById = new Map(context.fixtures.map((fixture) => [fixture.id, fixture]));
  return context.fixtureLinks.map((link) => {
    const fixture = fixtureById.get(link.fixtureId);
    return {
      id: `fixture:${link.id}`,
      target: 'fixture',
      name: fixture?.name ?? 'Unknown fixture',
      relation: 'Connected to',
      where: fixtureWhere(context.relatedWorld, fixture?.locationId ?? null),
      farId: link.fixtureId,
    };
  });
}

/** Maps graph and fixture-link responses into one connections list. */
export function toDetailConnections(
  itemId: string,
  ...[graph, fixtureLinks, fixtures, relatedWorld]: [
    graph: ConnectionsGraphResponse['data'],
    fixtureLinks: FixturesListForItemResponse['data'],
    fixtures: FixturesListResponse['data'],
    relatedWorld: PlacementWorld,
  ]
): DetailConnection[] {
  const context = { itemId, graph, fixtureLinks, fixtures, relatedWorld };
  return [...itemConnections(context), ...fixtureConnections(context)];
}

/** Summarizes the newest event or the known event count for History. */
export function historySummary(events: readonly EventModel[], total: number | null): string {
  const latest = events[0];
  if (latest !== undefined) return `Latest: ${latest.summary}`;
  if (total !== null && total > 0) return `${total} event${total === 1 ? '' : 's'}`;
  return 'Nothing recorded yet';
}
