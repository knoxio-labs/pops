/**
 * The component grain, netted.
 *
 * Both digital files state money the same way — one row per monetary
 * component, `Price Amount` or `Tax`, signed — so both need the same two
 * things: a check that no unrecognised component slipped in, and a sum. It
 * lives here rather than in either parser so the orders file and the
 * returns file cannot drift apart on what a component means.
 */
import { readCents, readText } from '../amazon/fields.js';
import { PRICE_COMPONENT, TAX_COMPONENT } from './columns.js';

import type { AmazonAnomaly, Row } from '../amazon/columns.js';

/** One row's contribution, once its type has been recognised. */
interface Component {
  readonly type: typeof PRICE_COMPONENT | typeof TAX_COMPONENT;
  readonly cents: number;
}

/**
 * Read every component row, or explain the first one that could not be
 * read and give up on the whole group.
 *
 * Giving up is right in both failure modes and for the same reason: a
 * partial sum is a plausible number. An order landed at a wrong total looks
 * exactly like an order that cost that much, and nothing downstream can
 * tell — where a group that is missing entirely is named in the anomaly
 * report.
 *
 * @param onAnomaly Called with the reason. `unknown-component-type` where a
 *   third component type appears, `unparseable-money` where the amount
 *   cannot be read.
 */
export function readComponents(
  rows: readonly Row[],
  amountColumn: string,
  typeColumn: string,
  onAnomaly: (anomaly: Omit<AmazonAnomaly, 'sourceOrderId'>) => void
): Component[] | null {
  const components: Component[] = [];

  for (const row of rows) {
    const type = readText(row[typeColumn]);
    if (type !== PRICE_COMPONENT && type !== TAX_COMPONENT) {
      onAnomaly({
        kind: 'unknown-component-type',
        detail:
          `a row states ${typeColumn} "${type ?? ''}", which is neither ` +
          `"${PRICE_COMPONENT}" nor "${TAX_COMPONENT}"; nothing says which side of the ` +
          'subtotal/tax split it belongs on',
      });
      return null;
    }

    const cents = readCents(row[amountColumn]);
    if (cents === null) {
      onAnomaly({
        kind: 'unparseable-money',
        detail: `a ${type} component has an unreadable ${amountColumn} "${row[amountColumn] ?? ''}"`,
      });
      return null;
    }

    components.push({ type, cents });
  }

  return components;
}

/** The money a group of components adds up to, in its own currency. */
export interface ComponentTotals {
  /** Σ positive `Price Amount`. */
  readonly subtotalCents: number;
  /** Σ positive `Tax`. */
  readonly taxCents: number;
  /** Magnitude of Σ negative components, of either type. */
  readonly discountCents: number;
  /** Σ every component, signed. What the card was actually charged. */
  readonly totalCents: number;
  /** Σ negative `Price Amount`, kept signed for the line it belongs to. */
  readonly priceAdjustmentCents: number;
}

/**
 * Split the components into the four money fields an order carries.
 *
 * The negatives are a promotion cancelling a price — an Audible credit
 * arrives as `Price Amount +13.59` beside `Price Amount -13.59` — so the
 * positives are the goods and the negatives are the discount. The identity
 * `subtotal + tax - discount == total` then holds by construction, and on
 * 90 of 90 orders in the reference bundle it also matches what the file
 * itself states.
 */
export function totalComponents(components: readonly Component[]): ComponentTotals {
  let subtotalCents = 0;
  let taxCents = 0;
  let discountCents = 0;
  let priceAdjustmentCents = 0;

  for (const { type, cents } of components) {
    if (cents < 0) {
      discountCents -= cents;
      if (type === PRICE_COMPONENT) priceAdjustmentCents += cents;
    } else if (type === PRICE_COMPONENT) subtotalCents += cents;
    else taxCents += cents;
  }

  return {
    subtotalCents,
    taxCents,
    discountCents,
    totalCents: subtotalCents + taxCents - discountCents,
    priceAdjustmentCents,
  };
}

/** Σ every component, signed — what a reversal actually moved. */
export function netComponents(components: readonly Component[]): number {
  return components.reduce((total, component) => total + component.cents, 0);
}
