import { parseAmountCents } from '../money.js';

/**
 * Grouping an Everyday Rewards receipt's rows into products.
 *
 * This is the whole difficulty of the source, and it is not obvious from
 * looking at a receipt on screen.
 *
 * An item row carries only `{ prefixChar, description, amount }` — there is
 * **no quantity field, no unit price and no SKU**. A product bought more
 * than once therefore spans several rows, with the money on a *later* row
 * than the name:
 *
 * ```
 * { description: "Thomas Dux Smoked Salmon Slices 300g", amount: ""      }
 * { description: "Qty 2 @ $9.24 each",                   amount: "18.48" }
 * { description: "PRICE REDUCED BY $7.26 each",          amount: ""      }
 * ```
 *
 * So an empty `amount` means "this row continues into the next", quantity
 * and unit price have to be read out of description TEXT, and a promotion
 * is a sibling row rather than a field. On one real receipt that is 7 rows
 * for 5 products, with the total stated as "TOTAL (6 items)" — three
 * different numbers, none of them interchangeable.
 *
 * **The naive parse sums correctly while being nonsense**, which is why
 * this needs its own tested module rather than an inline map. Reading one
 * row as one product yields a product called `Qty 2 @ $9.24 each` costing
 * $18.48 and another called `PRICE REDUCED BY $7.26 each` costing nothing —
 * and 2.00 + 5.70 + 3.80 + 2.60 + 18.48 is exactly the stated $32.58. A
 * totals check cannot catch this class of error, so the grouping itself has
 * to be asserted.
 */

export { parseAmountCents };

/** A row exactly as the GraphQL `ReceiptDetailsItems.items[]` gives it. */
export interface ReceiptRow {
  readonly prefixChar?: string | null;
  readonly description?: string | null;
  readonly amount?: string | null;
}

export interface GroupedItem {
  readonly name: string;
  readonly quantity: number;
  /** Line total in integer cents — what was actually paid for this product. */
  readonly lineTotalCents: number;
  /** Per-unit price in cents. Equals the line total for a quantity of one. */
  readonly unitPriceCents: number;
  /** `PRICE REDUCED BY $x each` and similar, verbatim, for provenance. */
  readonly notes: readonly string[];
  /** `#` marks a GST-applicable line on this receipt. */
  readonly gstApplicable: boolean;
  /** `^` marks a line sold at a promotional price. */
  readonly promotional: boolean;
}

export interface GroupingAnomaly {
  readonly kind: 'unattached-note' | 'unreadable-amount' | 'no-amount' | 'unreadable-quantity';
  readonly detail: string;
}

/** A line that takes money off, rather than a product. */
export interface GroupedDiscount {
  readonly description: string;
  /** Always positive: the sign is carried by being a discount. */
  readonly amountCents: number;
}

export interface GroupedRows {
  readonly items: readonly GroupedItem[];
  readonly discounts: readonly GroupedDiscount[];
  readonly anomalies: readonly GroupingAnomaly[];
}

/** `Qty 2 @ $9.24 each` — quantity and unit price, as prose. */
const QUANTITY_RE = /^qty\s+(\d+)\s*@\s*\$?([\d,]+\.?\d*)\s*each/iu;

/**
 * `0.202 kg NET @ $2.90/kg` — the same trick for anything weighed.
 *
 * Fruit, vegetables and the deli counter all price by weight, and the row
 * that carries the money is the weight line rather than the product line.
 * It is not a quantity: 0.202 is not a count of anything, and forcing it
 * into one gives a bag of oranges a quantity of zero. The weight is kept
 * verbatim as provenance and the line counts as one item.
 */
const MEASURE_RE = /^[\d.,]+\s*(kg|g|ml|l|ea)\b.*@/iu;

/**
 * Rows that modify the product above them rather than naming a new one.
 * Kept verbatim on the item instead of being parsed: a promotion's wording
 * is evidence, and inventing a structured discount from it would be a
 * guess about arithmetic the receipt already did.
 */
const NOTE_RE = /^(price reduced|was\s|save\s|member price|special|multibuy|discount)/iu;

interface OpenItem {
  name: string;
  quantity: number;
  lineTotalCents: number | null;
  unitPriceCents: number | null;
  notes: string[];
  gstApplicable: boolean;
  promotional: boolean;
}

/**
 * Accumulates one product at a time, because a product spans an unknown
 * number of rows and is only finished by the row that starts the next one.
 */
class Grouper {
  readonly items: GroupedItem[] = [];
  readonly discounts: GroupedDiscount[] = [];
  readonly anomalies: GroupingAnomaly[] = [];
  private open: OpenItem | null = null;

  /** Emit the product in progress, or report that its money never arrived. */
  close(): void {
    const open = this.open;
    this.open = null;
    if (open === null) return;
    if (open.lineTotalCents === null) {
      this.anomalies.push({
        kind: 'no-amount',
        detail: `"${open.name}" had no amount on any of its rows`,
      });
      return;
    }
    this.items.push({
      name: open.name,
      quantity: open.quantity,
      lineTotalCents: open.lineTotalCents,
      unitPriceCents: open.unitPriceCents ?? Math.round(open.lineTotalCents / open.quantity),
      notes: open.notes,
      gstApplicable: open.gstApplicable,
      promotional: open.promotional,
    });
  }

  start(row: ReceiptRow, description: string): void {
    this.close();
    const amount = parseAmountCents(row.amount);
    if (amount === null && (row.amount ?? '').trim() !== '') {
      this.anomalies.push({
        kind: 'unreadable-amount',
        detail: `"${description}" has an unreadable amount "${String(row.amount)}"`,
      });
    }
    this.open = {
      name: description,
      quantity: 1,
      lineTotalCents: amount,
      unitPriceCents: null,
      notes: [],
      gstApplicable: (row.prefixChar ?? '') === '#',
      promotional: (row.prefixChar ?? '') === '^',
    };
  }

  applyQuantity(row: ReceiptRow, match: RegExpExecArray, description: string): void {
    if (this.open === null) {
      this.anomalies.push({
        kind: 'unattached-note',
        detail: `quantity row with no product: "${description}"`,
      });
      return;
    }
    const quantity = Number(match[1]);
    if (Number.isSafeInteger(quantity) && quantity >= 1) {
      this.open.quantity = quantity;
      this.open.unitPriceCents = parseAmountCents(match[2]);
    } else {
      // `close()` derives a unit price by dividing by the quantity, so a
      // zero yields Infinity and poisons every total downstream of it. The
      // count is refused; the money on the row is not, because it is what
      // was actually paid.
      this.anomalies.push({
        kind: 'unreadable-quantity',
        detail: `"${this.open.name}" states a quantity of ${match[1] ?? '?'}; kept at 1`,
      });
    }
    // The money for a multi-quantity product lives on THIS row.
    const total = parseAmountCents(row.amount);
    if (total !== null) this.open.lineTotalCents = total;
  }

  /**
   * A weight line: keep the money and the wording, leave the count alone.
   */
  applyMeasure(row: ReceiptRow, description: string): void {
    if (this.open === null) {
      this.anomalies.push({
        kind: 'unattached-note',
        detail: `weight row with no product: "${description}"`,
      });
      return;
    }
    this.open.notes.push(description);
    const total = parseAmountCents(row.amount);
    if (total !== null) this.open.lineTotalCents = total;
  }

  applyNote(description: string): void {
    if (this.open === null) {
      this.anomalies.push({
        kind: 'unattached-note',
        detail: `note with no product: "${description}"`,
      });
      return;
    }
    this.open.notes.push(description);
  }

  /**
   * Money coming back is not a product.
   *
   * `Everyday Extra 10% Discount`, `BUY 2 for $4.60`, `CORN HARVEST OFFER`
   * — four different wordings across one account, with nothing in common
   * but the minus sign, which is why that is what this keys on. Left in the
   * item list they become products with negative prices, and the receipt
   * still adds up.
   */
  applyDiscount(description: string, amountCents: number): void {
    this.close();
    this.discounts.push({ description, amountCents: Math.abs(amountCents) });
  }
}

/**
 * Fold the flat row list into products.
 *
 * A row that names a product opens an item; the rows after it that carry no
 * name of their own — a quantity line, a promotion — belong to it until the
 * next named row.
 */
export function groupReceiptRows(rows: readonly ReceiptRow[]): GroupedRows {
  const grouper = new Grouper();

  for (const row of rows) {
    const description = (row.description ?? '').trim();
    if (description === '') continue;

    const quantityMatch = QUANTITY_RE.exec(description);
    const amount = parseAmountCents(row.amount);
    if (quantityMatch !== null) {
      grouper.applyQuantity(row, quantityMatch, description);
    } else if (MEASURE_RE.test(description)) {
      grouper.applyMeasure(row, description);
    } else if (amount !== null && amount < 0) {
      grouper.applyDiscount(description, amount);
    } else if (NOTE_RE.test(description)) {
      grouper.applyNote(description);
    } else {
      grouper.start(row, description);
    }
  }
  grouper.close();

  return { items: grouper.items, discounts: grouper.discounts, anomalies: grouper.anomalies };
}
