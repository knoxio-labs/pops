import type { Entity } from '../../contacts-api/types.gen';
import type { EntityUsageListResponses } from '../../finance-api/types.gen';

/**
 * The merchants and banks the other fixtures point at. Fictional throughout.
 *
 * Contacts owns an entity; finance only stores the id and the name it had
 * when a transaction was written. The two lists below are those two views of
 * the same three entities, and the gap between them is what the
 * contacts-absent mode shows: finance can still say "Harbour Grocer" from
 * its own rows, but nothing about it that only contacts knows.
 */

export const GROCER_ENTITY_ID = 'ent-harbour-grocer';
export const FUEL_ENTITY_ID = 'ent-northside-fuel';
export const BANK_ENTITY_ID = 'ent-kestrel-bank';

const EDITED = '2026-08-30T09:00:00.000Z';

/** Contacts' own records, as `GET /entities` returns them. */
export const CONTACT_ENTITIES: Entity[] = [
  {
    id: GROCER_ENTITY_ID,
    name: 'Harbour Grocer',
    type: 'company',
    abn: '51 824 753 556',
    aliases: ['HARBOUR GROCER', 'HBR GROCER PTY'],
    defaultTags: ['groceries'],
    defaultTransactionType: 'purchase',
    colour: '#3f8f6b',
    avatarAssetId: null,
    posterAssetId: null,
    notes: 'The corner shop on Wharf Street.',
    lastEditedTime: EDITED,
  },
  {
    id: FUEL_ENTITY_ID,
    name: 'Northside Fuel',
    type: 'company',
    abn: null,
    aliases: ['NTHSIDE FUEL'],
    defaultTags: ['transport'],
    defaultTransactionType: 'purchase',
    colour: '#b0632e',
    avatarAssetId: null,
    posterAssetId: null,
    notes: null,
    lastEditedTime: EDITED,
  },
  {
    id: BANK_ENTITY_ID,
    name: 'Kestrel Bank',
    type: 'bank',
    abn: null,
    aliases: [],
    defaultTags: [],
    defaultTransactionType: null,
    colour: '#4a5fb0',
    avatarAssetId: null,
    posterAssetId: null,
    notes: null,
    lastEditedTime: EDITED,
  },
];

type EntityUsageRow = EntityUsageListResponses[200]['data'][number];

/**
 * Finance's usage roll-up of the same entities. Harbour Grocer is the one
 * with activity; the bank has none, so the entities page shows it orphaned.
 */
export const ENTITY_USAGE: EntityUsageRow[] = CONTACT_ENTITIES.map((entity) => ({
  id: entity.id,
  name: entity.name,
  type: entity.type,
  abn: entity.abn ?? null,
  aliases: entity.aliases,
  avatarAssetId: entity.avatarAssetId ?? null,
  colour: entity.colour ?? null,
  defaultTags: entity.defaultTags,
  defaultTransactionType: entity.defaultTransactionType ?? null,
  notes: entity.notes ?? null,
  lastEditedTime: entity.lastEditedTime,
  transactionCount: { [GROCER_ENTITY_ID]: 3, [FUEL_ENTITY_ID]: 1 }[entity.id] ?? 0,
}));
