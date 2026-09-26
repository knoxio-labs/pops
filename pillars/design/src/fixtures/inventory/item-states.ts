/**
 * One item page model per detail state (spec 2.4): the same named fixtures
 * the lists show, with what the aggregate adds. A state that is about a
 * condition (stale, saving, offline) reuses one of these and adds the
 * condition; a state that is about the item (grouped, in hand, destroyed)
 * gets its own model here.
 */
import { coreItem, coreWorld } from './core';
import {
  drillProvenance,
  noProvenance,
  televisionConnections,
  televisionDocuments,
  televisionFacts,
  televisionPhotos,
  televisionProvenance,
} from './item-detail-content';
import { createdOnlyHistory, lifecycleEventFor, televisionHistory } from './item-history';

import type { DetailFact, ItemDetailModel } from '@/kit/inventory/item-detail/detail-model';
import type { EventModel } from '@/kit/inventory/shared/contracts';

const quantityFact = (value: number): DetailFact => ({
  key: 'quantity',
  label: 'Quantity',
  value: String(value),
  origin: 'entered',
  inline: false,
});

const entered = (key: string, label: string, value: string): DetailFact => ({
  key,
  label,
  value,
  origin: 'entered',
  inline: true,
});

/** A plain model for any named item: its type, nothing else recorded. */
export function detailFor(itemId: string, extra: Partial<ItemDetailModel> = {}): ItemDetailModel {
  const item = coreItem(itemId);
  const created: EventModel = {
    ...(createdOnlyHistory[0] as EventModel),
    itemId,
    itemName: item.name,
  };
  return {
    item,
    world: coreWorld,
    facts: [],
    provenance: noProvenance,
    connections: [],
    documents: [],
    paperless: 'connected',
    photos: [],
    events: [created],
    eventCount: 1,
    ...extra,
  };
}

/** Everything recorded: photos, every field kind, provenance, connections, documents. */
export const richTelevision: ItemDetailModel = detailFor('itm-tv', {
  facts: televisionFacts,
  provenance: televisionProvenance,
  connections: televisionConnections,
  documents: televisionDocuments,
  photos: televisionPhotos,
  events: televisionHistory,
  eventCount: televisionHistory.length,
});

/** A leaf-typed item: the header shows its path while the facts stay ordinary facts. */
export const subtypeItem: ItemDetailModel = detailFor('itm-tv', {
  item: {
    ...coreItem('itm-tv'),
    name: 'Guest fitted sheet',
    typeId: 'type-sheet',
    typeName: 'Bedding › Sheet',
  },
  facts: [
    entered('material', 'Material', 'Cotton'),
    entered('colour', 'Colour', 'White'),
    entered('fitted', 'Fitted', 'Yes'),
  ],
});

/** Only a name and a place: untyped, no code, nothing else. */
export const sparseLadder: ItemDetailModel = detailFor('itm-ladder');

/** Three of the same thing on one record. */
export const groupedCables: ItemDetailModel = detailFor('itm-hdmi', {
  facts: [quantityFact(3), entered('length', 'Length', '2 m')],
});

/** Directly in a location, with part of its provenance. */
export const drillOnWorkbench: ItemDetailModel = detailFor('itm-drill', {
  facts: [entered('brand', 'Brand', 'Makita'), entered('power', 'Battery', '18 V')],
  provenance: drillProvenance,
  documents: [{ id: 'd5', title: 'Bunnings receipt', kind: 'Receipt', added: '8 Jun 2024' }],
});

/** Inside a container, inside a room. */
export const kettleInBox: ItemDetailModel = detailFor('itm-kettle');

/** In hand, with a remembered place to put it back. */
export const tapeInHand: ItemDetailModel = detailFor('itm-tape', {
  facts: [entered('brand', 'Brand', 'Stanley')],
});

/** In hand, and the place it came from has been deleted. */
export const headphonesInHand: ItemDetailModel = detailFor('itm-headphones', {
  facts: [entered('manufacturer', 'Manufacturer', 'Sony')],
});

const retiredEvent = lifecycleEventFor({
  itemId: 'itm-camera',
  itemName: 'Film camera',
  kind: 'retired',
  at: '2026-09-18T10:00:00Z',
  reason: 'Replaced by a phone',
});

export const retiredCamera: ItemDetailModel = detailFor('itm-camera', {
  facts: [
    entered('manufacturer', 'Manufacturer', 'Olympus'),
    entered('powered', 'Needs power', 'No'),
  ],
  lifecycleEvent: retiredEvent,
  events: [retiredEvent],
  eventCount: 6,
});

const discardedEvent = lifecycleEventFor({
  itemId: 'itm-speaker',
  itemName: 'Bluetooth speaker',
  kind: 'discarded',
  at: '2026-09-17T08:20:00Z',
  reason: 'Battery swollen',
});

export const discardedSpeaker: ItemDetailModel = detailFor('itm-speaker', {
  facts: [
    entered('manufacturer', 'Manufacturer', 'JBL'),
    entered('powered', 'Needs power', 'Battery'),
    entered('connectors', 'Connectors', 'Bluetooth, USB-C'),
  ],
  lifecycleEvent: discardedEvent,
  events: [discardedEvent],
  eventCount: 4,
});

const lostEvent = lifecycleEventFor({
  itemId: 'itm-umbrella',
  itemName: 'Umbrella',
  kind: 'lost',
  at: '2026-09-15T17:00:00Z',
  reason: 'Left on the train',
});

export const lostUmbrella: ItemDetailModel = detailFor('itm-umbrella', {
  lifecycleEvent: lostEvent,
  events: [lostEvent],
  eventCount: 3,
});

const destroyedEvent = lifecycleEventFor({
  itemId: 'itm-phone',
  itemName: 'Cracked phone',
  kind: 'destroyed',
  at: '2026-09-12T12:00:00Z',
  reason: 'Recycled at the drop-off',
});

export const destroyedPhone: ItemDetailModel = detailFor('itm-phone', {
  facts: [entered('manufacturer', 'Manufacturer', 'Google')],
  lifecycleEvent: destroyedEvent,
  events: [destroyedEvent],
  eventCount: 9,
});

/** A typed item with facts and connections but no provenance at all. */
export const printerNoProvenance: ItemDetailModel = detailFor('itm-printer', {
  facts: [
    entered('manufacturer', 'Manufacturer', 'Brother'),
    entered('powered', 'Needs power', 'Yes'),
  ],
  connections: [
    {
      id: 'c9',
      target: 'fixture',
      name: 'Power point 1',
      relation: 'Plugged into',
      where: 'Study, under the desk',
    },
  ],
});

/** The Wi-Fi router, changed here and on the phone at once. */
export const routerConflicted: ItemDetailModel = detailFor('itm-router', {
  facts: [entered('manufacturer', 'Manufacturer', 'Netgear'), entered('ports', 'Ports', '4')],
});

/** The blender, changed on the phone after this page loaded. */
export const blenderStale: ItemDetailModel = detailFor('itm-blender');
