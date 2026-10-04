type Parsed<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; error: string };

/**
 * The legacy `items` columns inventory's `item.create` and `item.edit` accept
 * under `legacy`, restricted to the ones `items.get` projects as `provenance`.
 */
export interface LegacyProvenancePatch {
  purchasedFromName?: string | null;
  purchasePrice?: number | null;
  purchaseDate?: string | null;
  warrantyExpires?: string | null;
  purchaseTransactionId?: string | null;
}

// Inventory derives the stored URI from the transaction id and has no other
// spelling for it, so this is the only URI that survives the round trip.
const TRANSACTION_URI_PREFIX = 'pops://finance/transaction/';

const TEXT_KEYS = {
  merchant: 'purchasedFromName',
  purchasedOn: 'purchaseDate',
  warrantyExpires: 'warrantyExpires',
} as const;

const PROVENANCE_KEYS = ['merchant', 'price', 'purchasedOn', 'warrantyExpires', 'transactionUri'];

const CLEARED: LegacyProvenancePatch = {
  purchasedFromName: null,
  purchasePrice: null,
  purchaseDate: null,
  warrantyExpires: null,
  purchaseTransactionId: null,
};

const provenanceProperties = {
  merchant: { type: ['string', 'null'], minLength: 1, description: 'Who it was bought from' },
  price: { type: ['number', 'null'], minimum: 0, description: 'Price paid' },
  purchasedOn: { type: ['string', 'null'], minLength: 1, description: 'Purchase date' },
  warrantyExpires: { type: ['string', 'null'], minLength: 1, description: 'Warranty end date' },
  transactionUri: {
    type: ['string', 'null'],
    pattern: '^pops://finance/transaction/.+$',
    description: 'The finance transaction that paid for it, as pops://finance/transaction/<id>',
  },
} as const;

/** JSON Schema for `provenance` on `inventory.items.create`. */
export const createProvenanceSchema = {
  type: 'object',
  additionalProperties: false,
  minProperties: 1,
  properties: provenanceProperties,
  description:
    'Purchase facts, in the shape inventory.items.get returns as provenance. Omitted keys stay unset.',
} as const;

/** JSON Schema for `provenance` on `inventory.items.update`. */
export const updateProvenanceSchema = {
  ...createProvenanceSchema,
  type: ['object', 'null'],
  description:
    'Purchase facts, in the shape inventory.items.get returns as provenance. A patch: omitted keys are unchanged and a null key clears that fact. null clears every fact.',
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function parseTransactionId(value: unknown): Parsed<string | null> {
  if (value === null) return { ok: true, value: null };
  if (typeof value !== 'string' || !value.startsWith(TRANSACTION_URI_PREFIX)) {
    return {
      ok: false,
      error: `provenance.transactionUri must be ${TRANSACTION_URI_PREFIX}<id> or null`,
    };
  }
  const id = value.slice(TRANSACTION_URI_PREFIX.length);
  if (id.length === 0 || id.includes('/')) {
    return { ok: false, error: 'provenance.transactionUri is missing its transaction id' };
  }
  return { ok: true, value: id };
}

function parsePrice(value: unknown): Parsed<number | null> {
  if (value === null) return { ok: true, value: null };
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return { ok: false, error: 'provenance.price must be a non-negative number or null' };
  }
  return { ok: true, value };
}

function parseText(key: string, value: unknown): Parsed<string | null> {
  if (value === null) return { ok: true, value: null };
  if (typeof value !== 'string' || value.length === 0) {
    return { ok: false, error: `provenance.${key} must be a non-empty string or null` };
  }
  return { ok: true, value };
}

function parseFacts(provenance: Record<string, unknown>): Parsed<LegacyProvenancePatch> {
  const patch: LegacyProvenancePatch = {};
  for (const [key, column] of Object.entries(TEXT_KEYS)) {
    if (provenance[key] === undefined) continue;
    const text = parseText(key, provenance[key]);
    if (!text.ok) return text;
    patch[column] = text.value;
  }
  if (provenance['price'] !== undefined) {
    const price = parsePrice(provenance['price']);
    if (!price.ok) return price;
    patch.purchasePrice = price.value;
  }
  if (provenance['transactionUri'] !== undefined) {
    const id = parseTransactionId(provenance['transactionUri']);
    if (!id.ok) return id;
    patch.purchaseTransactionId = id.value;
  }
  return { ok: true, value: patch };
}

/**
 * Parses an optional `provenance` argument into the legacy-column patch
 * inventory writes it through. `undefined` when the argument is absent. A
 * `null` argument clears every fact and is accepted only where `allowClear`
 * says so, since a create has nothing to clear.
 */
export function optionalProvenance(
  args: Record<string, unknown>,
  allowClear: boolean
): Parsed<LegacyProvenancePatch | undefined> {
  const provenance = args['provenance'];
  if (provenance === undefined) return { ok: true, value: undefined };
  if (provenance === null && allowClear) return { ok: true, value: CLEARED };
  if (!isRecord(provenance)) {
    return {
      ok: false,
      error: allowClear ? 'provenance must be an object or null' : 'provenance must be an object',
    };
  }
  const unknownKey = Object.keys(provenance).find((key) => !PROVENANCE_KEYS.includes(key));
  if (unknownKey !== undefined) {
    return { ok: false, error: `provenance.${unknownKey} is not allowed` };
  }
  const patch = parseFacts(provenance);
  if (!patch.ok) return patch;
  if (Object.keys(patch.value).length === 0) {
    return {
      ok: false,
      error: `provenance must set at least one of ${PROVENANCE_KEYS.join(', ')}`,
    };
  }
  return patch;
}
