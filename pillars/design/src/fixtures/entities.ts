import { entityColorById } from './entity-colors';

/**
 * Fictional `entities` rows for the contacts entity screens: the details
 * page and the entity-owned management list. `avatar`, `poster` and `colour`
 * are the three fields the model is gaining; all three are optional, so the
 * set below deliberately covers every combination — full identity, colour
 * only, and nothing at all — rather than showing only the best-dressed
 * entity.
 */
export type EntityType =
  | 'company'
  | 'person'
  | 'government'
  | 'bank'
  | 'place'
  | 'brand'
  | 'organisation';

export interface Entity {
  id: string;
  name: string;
  type: EntityType;
  abn?: string;
  aliases?: string[];
  defaultTransactionType?: string;
  defaultTags?: string[];
  notes?: string;
  /** A small square mark. Falls back to initials on the entity's colour. */
  avatar?: string;
  /** A wide banner image. Absent is the common case — most entities never get one. */
  poster?: string;
  /** An `ENTITY_COLORS` id, assigned at random when the entity is created. */
  colourId?: string;
}

function avatarMark(colour: string, shape: string): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">` +
    `<rect width="64" height="64" fill="${colour}"/>${shape}</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function posterImage(a: string, b: string, shape: string): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 200">` +
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">` +
    `<stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs>` +
    `<rect width="640" height="200" fill="url(#g)"/>${shape}</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export const entities: Entity[] = [
  {
    id: 'e1',
    name: 'Woolworths',
    type: 'company',
    abn: '88 000 014 675',
    aliases: ['Woolworths Group', 'WW Supermarkets'],
    defaultTransactionType: 'expense',
    defaultTags: ['category:groceries'],
    colourId: 'lime',
    avatar: avatarMark('#0a7d3c', '<circle cx="32" cy="32" r="20" fill="#fff"/>'),
    poster: posterImage(
      '#0a7d3c',
      '#0f5c2c',
      '<circle cx="540" cy="60" r="90" fill="#ffffff22"/><circle cx="80" cy="170" r="120" fill="#ffffff14"/>'
    ),
  },
  {
    id: 'e2',
    name: 'Sarah Chen',
    type: 'person',
    aliases: ['S. Chen'],
    notes: 'Splits rent and utilities on the Everyday account. Prefers bank transfer over cash.',
    colourId: 'violet',
    avatar: avatarMark(
      '#5b3fa8',
      '<circle cx="32" cy="24" r="12" fill="#fff"/><path d="M12 56c0-14 9-22 20-22s20 8 20 22" fill="#fff"/>'
    ),
  },
  {
    id: 'e3',
    name: 'Australian Taxation Office',
    type: 'government',
    abn: '51 824 753 556',
    aliases: ['ATO'],
    defaultTransactionType: 'expense',
    defaultTags: ['category:tax'],
    notes: 'Quarterly BAS and annual PAYG instalments land from this entity.',
    colourId: 'indigo',
    poster: posterImage(
      '#233876',
      '#111c40',
      '<rect x="480" y="30" width="120" height="140" rx="8" fill="#ffffff1a"/>'
    ),
  },
  {
    id: 'e4',
    name: 'ANZ',
    type: 'bank',
    abn: '11 005 357 522',
    colourId: 'sky',
    avatar: avatarMark(
      '#0072ac',
      '<circle cx="32" cy="32" r="16" fill="none" stroke="#fff" stroke-width="6"/>'
    ),
  },
  {
    id: 'e5',
    name: 'The Grounds of Alexandria',
    type: 'place',
    aliases: ['The Grounds'],
    defaultTransactionType: 'expense',
    defaultTags: ['category:dining', 'venue:cafe'],
    colourId: 'amber',
  },
  {
    id: 'e6',
    name: 'Unlabelled Merchant Pty Ltd',
    type: 'company',
    notes: 'Matched by ABN only — no logo or alias has been added yet.',
  },
  {
    id: 'e7',
    name: 'IKEA',
    type: 'brand',
    abn: '48 004 383 771',
    defaultTransactionType: 'expense',
    defaultTags: ['category:home'],
    colourId: 'fuchsia',
    avatar: avatarMark('#0058a3', '<rect x="16" y="16" width="32" height="32" fill="#ffda1a"/>'),
  },
  {
    id: 'e8',
    name: 'Alexandria Netball Association',
    type: 'organisation',
    aliases: ['ANA'],
    notes: 'Season fees, twice yearly.',
  },
  {
    id: 'e9',
    name: 'Bunnings Warehouse',
    type: 'company',
    abn: '26 008 672 179',
    defaultTransactionType: 'expense',
    defaultTags: ['category:home'],
    avatar: avatarMark('#0d5257', '<rect x="14" y="26" width="36" height="18" fill="#fff"/>'),
  },
  {
    id: 'e10',
    name: 'Sydney Opera House Trust',
    type: 'government',
    aliases: ['SOH Trust'],
    notes: 'Occasional ticketed events, paid by card on the night.',
    poster: posterImage(
      '#7a1f3d',
      '#3d0f1f',
      '<path d="M60 190 Q120 40 220 190" fill="#ffffff1a"/><path d="M180 190 Q260 60 340 190" fill="#ffffff14"/>'
    ),
  },
];

export const entitiesById = new Map(entities.map((e) => [e.id, e]));

export const ENTITY_TYPE_LABEL: Record<EntityType, string> = {
  company: 'Company',
  person: 'Person',
  government: 'Government',
  bank: 'Bank',
  place: 'Place',
  brand: 'Brand',
  organisation: 'Organisation',
};

export function entityColour(entity: Entity) {
  return entity.colourId ? entityColorById.get(entity.colourId) : undefined;
}

/** Two letters, for the entities with no avatar. */
export function initials(name: string): string {
  const [first, second] = name.split(/\s+/u).filter(Boolean);
  if (first && second) return (first.slice(0, 1) + second.slice(0, 1)).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}
