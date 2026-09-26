import { legacyFactInputs } from './detail-fact-inputs';

import type { LegacyFactInput } from './detail-fact-inputs';
import type { DetailFact, DetailProvenance, LegacyItem, WebItem } from './detail-types';

const KNOWN_FACT_KEYS = new Set([
  'assetId',
  'brand',
  'condition',
  'deductible',
  'inUse',
  'location',
  'model',
  'purchaseDate',
  'purchasePrice',
  'replacementValue',
  'resaleValue',
  'room',
  'type',
  'warrantyExpires',
]);

const FACT_LABELS: Readonly<Record<string, string>> = {
  assetId: 'Asset ID',
  brand: 'Brand',
  condition: 'Condition',
  deductible: 'Deductible',
  inUse: 'Status',
  location: 'Location',
  model: 'Model',
  purchaseDate: 'Purchased',
  purchasePrice: 'Purchase price',
  replacementValue: 'Replacement value',
  resaleValue: 'Resale value',
  room: 'Room',
  type: 'Type',
  warrantyExpires: 'Warranty expires',
};

type FactExtra = Partial<Pick<DetailFact, 'origin' | 'missingInputs' | 'mono'>>;

interface AddFactInput {
  facts: DetailFact[];
  key: string;
  label: string;
  value: string | null;
  extra?: FactExtra;
}

function titleCase(value: string): string {
  return value
    .replaceAll(/([a-z])([A-Z])/g, '$1 $2')
    .replaceAll(/[_-]+/g, ' ')
    .replaceAll(/\s+/g, ' ')
    .trim()
    .replace(/^./, (first) => first.toUpperCase());
}

function dateValue(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function moneyValue(value: number): string {
  return new Intl.NumberFormat('en-AU', {
    currency: 'AUD',
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
    style: 'currency',
  }).format(value);
}

/** Converts a detail field value into the display text shared by facts and history. */
export function detailTextValue(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) {
    const values = value.map(detailTextValue).filter((entry): entry is string => entry !== null);
    return values.length > 0 ? values.join(', ') : null;
  }
  return JSON.stringify(value) ?? null;
}

function fieldValue(key: string, value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (key === 'purchaseDate' || key === 'warrantyExpires') {
    const text = detailTextValue(value);
    return text === null ? null : dateValue(text);
  }
  if (key === 'purchasePrice' || key === 'replacementValue' || key === 'resaleValue') {
    if (typeof value === 'number') return moneyValue(value);
  }
  return detailTextValue(value);
}

function fieldLabel(key: string): string {
  return FACT_LABELS[key] ?? titleCase(key);
}

function addFact({ facts, key, label, value, extra = {} }: AddFactInput): void {
  if (value === null && extra.origin !== 'missing-inputs') return;
  facts.push({ key, label, value, origin: 'entered', ...extra });
}

function appendLegacyFact(facts: DetailFact[], { key, value, extra }: LegacyFactInput): void {
  addFact({ facts, key, label: fieldLabel(key), value: fieldValue(key, value), extra });
}

function computedFact(facts: DetailFact[], entry: WebItem['computedValues'][number]): void {
  const existing = facts.find((fact) => fact.key === entry.fieldId);
  const label = existing?.label ?? fieldLabel(entry.fieldId);
  const index = existing === undefined ? -1 : facts.indexOf(existing);
  if (entry.state === 'unavailable') {
    const missingInputs = entry.missingInputs.map((input) => input.fieldId);
    const fact: DetailFact = {
      key: entry.fieldId,
      label,
      value: null,
      origin: 'missing-inputs',
      missingInputs,
    };
    if (index === -1) facts.push(fact);
    else facts[index] = fact;
    return;
  }
  const fact: DetailFact = {
    key: entry.fieldId,
    label,
    value: detailTextValue(entry.values[0]),
    origin: entry.state === 'overridden' ? 'overridden' : 'calculated',
  };
  if (index === -1) facts.push(fact);
  else facts[index] = fact;
}

function appendWebFields(facts: DetailFact[], webItem?: WebItem): void {
  for (const [key, value] of Object.entries(webItem?.fields ?? {})) {
    if (KNOWN_FACT_KEYS.has(key)) continue;
    const display = detailTextValue(value);
    if (display !== null) addFact({ facts, key, label: fieldLabel(key), value: display });
  }
}

function appendComputedFacts(facts: DetailFact[], webItem?: WebItem): void {
  for (const computed of webItem?.computedValues ?? []) computedFact(facts, computed);
}

/** Maps the legacy item fields and catalogue fields to the facts rail order. */
export function buildDetailFacts(legacyItem: LegacyItem, webItem?: WebItem): DetailFact[] {
  const facts: DetailFact[] = [];
  for (const input of legacyFactInputs(legacyItem, webItem)) appendLegacyFact(facts, input);
  appendWebFields(facts, webItem);
  if (webItem && webItem.quantity > 1) {
    addFact({ facts, key: 'quantity', label: 'Quantity', value: String(webItem.quantity) });
  }
  appendComputedFacts(facts, webItem);
  return facts;
}

function dateValueOrNull(value: string | null | undefined): string | null {
  return value === null || value === undefined ? null : dateValue(value);
}

function moneyValueOrNull(value: number | null | undefined): string | null {
  return value === null || value === undefined ? null : moneyValue(value);
}

/** Maps legacy and web purchase fields to the Overview provenance block. */
export function buildDetailProvenance(legacyItem: LegacyItem, webItem?: WebItem): DetailProvenance {
  const provenance = webItem?.provenance;
  const purchasedOn = provenance?.purchasedOn ?? legacyItem.purchaseDate;
  const price = provenance?.price ?? legacyItem.purchasePrice;
  const warrantyUntil = provenance?.warrantyExpires ?? legacyItem.warrantyExpires;
  return {
    purchasedOn: dateValueOrNull(purchasedOn),
    pricePaid: moneyValueOrNull(price),
    merchant: provenance?.merchant ?? legacyItem.purchasedFromName,
    warrantyUntil: dateValueOrNull(warrantyUntil),
    purchaseTransactionId: provenance?.transactionUri ?? legacyItem.purchaseTransactionId,
    purchaseSourceId: legacyItem.purchasedFromId,
  };
}
