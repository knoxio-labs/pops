import type {
  DetailConnection,
  DetailDocument,
  DetailFact,
  DetailProvenance,
} from '@/kit/inventory/item-detail/detail-model';
/**
 * What the item aggregate adds to a row for the named fixtures: typed facts
 * (every primitive kind on the Television, one computed), provenance,
 * connections to items and fixtures, Paperless documents and photos. The
 * photos are inline SVG so the canvas needs no network.
 */
import type { PhotoItem } from '@/kit/inventory/photos/photo-item';

const fact = (
  key: string,
  label: string,
  value: string | null,
  extra: Partial<Omit<DetailFact, 'key' | 'label' | 'value'>> = {}
): DetailFact => ({ key, label, value, origin: 'entered', inline: true, ...extra });

/** The Television: one field of every kind its Electronics type has. */
export const televisionFacts: readonly DetailFact[] = [
  fact('manufacturer', 'Manufacturer', 'LG'),
  fact('ports', 'Ports', '4'),
  fact('powered', 'Needs power', 'Yes'),
  fact('connectors', 'Connectors', 'HDMI, USB-C, Optical'),
  fact('weight', 'Weight', '18.9 kg'),
  fact('registered_at', 'Warranty registered', '14 Feb 2026, 10:12'),
  fact('manual_url', 'Manual', 'lg.com/oled55c4'),
  fact('works_with', 'Works with', 'Soundbar, Game console'),
  fact('replacement_value', 'Replacement value', '$2,499', { origin: 'calculated', inline: false }),
];

/** A computed value someone typed over. */
export const overriddenValue: DetailFact = fact(
  'replacement_value',
  'Replacement value',
  '$2,100',
  {
    origin: 'overridden',
  }
);

/** A computed value still waiting on an input. */
export const missingInputsValue: DetailFact = fact('replacement_value', 'Replacement value', null, {
  origin: 'missing-inputs',
  inline: false,
  missingInputs: ['Unit price'],
});

export const televisionProvenance: DetailProvenance = {
  purchasedOn: '14 Feb 2026',
  pricePaid: '$2,299.00',
  merchant: 'JB Hi-Fi',
  warrantyUntil: '14 Feb 2028',
  purchase: { id: 'ord-4471', label: 'JB Hi-Fi order 4471' },
};

/** Nothing recorded: the section folds to one line. */
export const noProvenance: DetailProvenance = {
  purchasedOn: null,
  pricePaid: null,
  merchant: null,
  warrantyUntil: null,
  purchase: null,
};

export const drillProvenance: DetailProvenance = {
  ...noProvenance,
  purchasedOn: '8 Jun 2024',
  pricePaid: '$199.00',
  merchant: 'Bunnings',
};

export const televisionConnections: readonly DetailConnection[] = [
  { id: 'c1', target: 'item', name: 'Soundbar', relation: 'HDMI eARC to', where: 'TV unit' },
  { id: 'c2', target: 'item', name: 'Game console', relation: 'HDMI 2 to', where: 'TV unit' },
  {
    id: 'c3',
    target: 'fixture',
    name: 'Power point 2',
    relation: 'Plugged into',
    where: 'Living room, left wall',
  },
];

export const televisionDocuments: readonly DetailDocument[] = [
  { id: 'd1', title: 'JB Hi-Fi tax invoice 4471', kind: 'Receipt', added: '14 Feb 2026' },
  { id: 'd2', title: 'LG OLED55C4 owner manual', kind: 'Manual', added: '15 Feb 2026' },
  { id: 'd3', title: 'LG warranty certificate', kind: 'Warranty', added: '16 Feb 2026' },
];

/** The same documents with the manual deleted in Paperless since it was linked. */
export const televisionDocumentsOneMissing: readonly DetailDocument[] = televisionDocuments.map(
  (doc) => (doc.id === 'd2' ? { ...doc, missing: true } : doc)
);

function photo(id: number, label: string, [from, to]: readonly [string, string]): PhotoItem {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="360"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs><rect width="480" height="360" fill="url(#g)"/><rect x="92" y="78" width="296" height="176" rx="10" fill="#0b0f19" opacity="0.82"/><rect x="226" y="254" width="28" height="30" fill="#0b0f19" opacity="0.6"/><rect x="176" y="284" width="128" height="8" rx="4" fill="#0b0f19" opacity="0.6"/></svg>`;
  return {
    id,
    url: `data:image/svg+xml,${encodeURIComponent(svg)}`,
    caption: label,
    sortOrder: id,
  };
}

export const televisionPhotos: readonly PhotoItem[] = [
  photo(1, 'Wall-mounted, bracket bolts in the left drawer', ['#c9b79c', '#8d7b64']),
  photo(2, 'Serial number label', ['#9aa7b4', '#5e6b78']),
  photo(3, 'Ports on the back', ['#b8a99a', '#6f6257']),
  photo(4, 'Original box, kept in the garage', ['#c2b280', '#8a7a4c']),
];

/** A photo whose file no longer loads: valid base64 that is not an image. */
export const brokenPhotos: readonly PhotoItem[] = [
  { id: 9, url: 'data:image/png;base64,AAAA', caption: 'Front', sortOrder: 0 },
  ...televisionPhotos.slice(1),
];
