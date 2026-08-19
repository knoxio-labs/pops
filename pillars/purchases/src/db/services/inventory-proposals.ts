/**
 * Proposing inventory assets from durable line items, and recording what a
 * human decided about each proposal.
 *
 * **Propose, never create.** Nothing here writes into `inventory`. A
 * proposal is a projection of rows purchases already holds, shaped in
 * inventory's own field names so the caller that accepts one can hand it
 * straight to `POST /items` on that pillar; the write into inventory
 * belongs to whoever is holding the human's consent, and purchases learns
 * about it afterwards through {@link decideInventoryProposal}. Fanning out
 * automatically fills inventory with cables, batteries and light globes
 * inside a month, after which the user stops trusting it — which is why
 * `ITEM_KINDS` calls both fan-out directions proposals.
 *
 * **A proposal is a unit slot, not a line.** A quantity-3 durable line is
 * up to three assets with three warranties and three resale values, so it
 * yields three proposals that are accepted or declined one at a time.
 * `purchase_item_units` is where a decision lands, and rows there are
 * created lazily — a slot with no row yet is a proposal nobody has answered.
 *
 * **What stops a line proposing twice** is that a decided slot is not
 * offered. `inventory_item_uri` says the unit is in inventory,
 * `inventory_declined_at` says it was offered and turned down, and a CHECK
 * holds them mutually exclusive. A link the nightly cron later found
 * unresolvable (`inventory_item_stale_at`) stays decided: that flag is
 * evidence for a human, not grounds to re-offer an asset they deleted.
 */
import { and, asc, eq, inArray, isNotNull } from 'drizzle-orm';

import { allocateProRata } from '../../ingest/allocation.js';
import { InventoryProposalConflictError } from '../errors.js';
import { purchaseChargeLinks, purchaseCharges } from '../schema/charges.js';
import { purchaseItems, purchaseItemUnits } from '../schema/items.js';
import { purchases, purchaseShipments } from '../schema/purchases.js';
import { landedCostCents } from './accounting.js';
import { nowIso, type PurchasesDb } from './internal.js';

import type { ShipmentStatus } from '../../contract/constants.js';
import type { PurchaseItemUnitRow } from '../schema.js';

/**
 * Shipment states in which the goods were never received. A line on one of
 * these is not an asset, whatever the merchant charged for it.
 */
const UNRECEIVED_SHIPMENT_STATUSES: readonly ShipmentStatus[] = ['cancelled', 'returned'];

/**
 * One unanswered offer to inventory.
 *
 * The payload fields carry inventory's own names so a caller can map them
 * onto `POST /items` without a translation table in between — with one
 * deliberate exception. Money crosses in integer cents, because purchases
 * holds no float dollar value anywhere and must not mint one on the way
 * out; inventory's `purchasePrice` is a `real`, and dividing by 100 is the
 * accepting caller's step.
 *
 * `brand` and `model` are absent rather than null. The ticket that asked
 * for this wanted them, and purchases holds neither: no schema column, no
 * source that states one. Splitting them out of a line name is guessing,
 * and this pillar declines to guess where a wrong answer is invisible
 * afterwards — the same call `chooseMerchant` makes on an ambiguous entity.
 */
export interface InventoryProposal {
  readonly purchaseId: string;
  readonly itemId: string;
  /**
   * The unit row this proposal is about, when one already exists — a line
   * whose serial numbers arrived at ingest has units before it has
   * decisions. Null for a slot no row has been created for yet, which is
   * the common case.
   */
  readonly unitId: string | null;
  /**
   * Which of the line's units this is, from zero. An ordinal for display
   * and for telling two otherwise identical offers apart; it is not
   * persisted and not an identity a caller may address a decision by.
   */
  readonly slot: number;
  readonly itemName: string;
  /** From the unit, where the source stated one. The strongest identity an asset can carry. */
  readonly serialNumber: string | null;
  /** The order's `orderedAt` — when the thing was bought, not when the row was written. */
  readonly purchaseDate: string;
  /** This unit's share of the line's landed cost. The shares of a line sum to it exactly. */
  readonly purchasePriceCents: number;
  readonly purchasedFromName: string | null;
  /**
   * `pops://finance/transaction/<id>`, when the order settled against
   * exactly one transaction a human confirmed. Null otherwise, and both
   * halves of that matter: an unconfirmed link is the matcher's proposal
   * and not a fact, and an order spanning two transactions has no single
   * one to name — inventory's column holds one URI, so guessing which
   * would file the asset against half its own payment.
   */
  readonly purchaseTransactionUri: string | null;
  /**
   * Whether the line's `durable` kind was asserted by a human or merely
   * proposed by a classification pass.
   *
   * Travels with the proposal because the line alone cannot carry it, the
   * same reason `itemsByTag` ships a tag's confirmation beside the line. A
   * review surface that cannot tell the two apart is stacking a guess on a
   * guess without saying so.
   */
  readonly kindConfirmed: boolean;
}

/** A human's answer to one proposal. */
export type InventoryProposalDecision =
  | {
      readonly decision: 'accepted';
      /** Where the asset now lives: `pops://inventory/item/<id>`. */
      readonly inventoryItemUri: string;
      readonly unitId?: string;
    }
  | { readonly decision: 'declined'; readonly unitId?: string };

interface ProposableLine {
  readonly id: string;
  readonly name: string;
  readonly quantity: number;
  readonly lineTotalCents: number;
  readonly refundedCents: number;
  readonly allocatedShippingCents: number;
  readonly allocatedAdjustmentCents: number;
  readonly kindConfirmedAt: string | null;
}

/**
 * The order's lines that could become assets.
 *
 * `kind = 'durable'` is the substrate — nothing here re-derives durability
 * from a name. Two further exclusions are not fussiness: a line on a
 * cancelled or returned delivery is goods that never arrived, and a fully
 * refunded line is goods that went back, and proposing either as an asset
 * is the noise that gets a fan-out prompt dismissed unread. A *partial*
 * refund is a price change, not a return, so it still proposes.
 */
function listProposableLines(db: PurchasesDb, purchaseId: string): ProposableLine[] {
  return db
    .select({
      id: purchaseItems.id,
      name: purchaseItems.name,
      quantity: purchaseItems.quantity,
      lineTotalCents: purchaseItems.lineTotalCents,
      refundedCents: purchaseItems.refundedCents,
      allocatedShippingCents: purchaseItems.allocatedShippingCents,
      allocatedAdjustmentCents: purchaseItems.allocatedAdjustmentCents,
      kindConfirmedAt: purchaseItems.kindConfirmedAt,
      shipmentStatus: purchaseShipments.status,
    })
    .from(purchaseItems)
    .leftJoin(purchaseShipments, eq(purchaseItems.shipmentId, purchaseShipments.id))
    .where(and(eq(purchaseItems.purchaseId, purchaseId), eq(purchaseItems.kind, 'durable')))
    .orderBy(asc(purchaseItems.position), asc(purchaseItems.id))
    .all()
    .filter((line) => {
      if (
        line.shipmentStatus !== null &&
        UNRECEIVED_SHIPMENT_STATUSES.includes(line.shipmentStatus)
      )
        return false;
      return line.refundedCents < line.lineTotalCents || line.lineTotalCents <= 0;
    });
}

/**
 * The single finance transaction this order settled against, or null.
 *
 * Confirmed links only. The sweep tears down and rewrites every
 * unconfirmed link on each run, so one of those is a candidate the engine
 * currently likes rather than a settlement anyone has agreed to.
 */
function settlementTransactionUri(db: PurchasesDb, purchaseId: string): string | null {
  const rows = db
    .selectDistinct({ uri: purchaseChargeLinks.transactionUri })
    .from(purchaseChargeLinks)
    .innerJoin(purchaseCharges, eq(purchaseChargeLinks.chargeId, purchaseCharges.id))
    .where(
      and(eq(purchaseCharges.purchaseId, purchaseId), isNotNull(purchaseChargeLinks.confirmedAt))
    )
    .all();
  return rows.length === 1 ? (rows[0]?.uri ?? null) : null;
}

function unitsByItem(
  db: PurchasesDb,
  itemIds: readonly string[]
): Map<string, PurchaseItemUnitRow[]> {
  const grouped = new Map<string, PurchaseItemUnitRow[]>();
  if (itemIds.length === 0) return grouped;
  const rows = db
    .select()
    .from(purchaseItemUnits)
    .where(inArray(purchaseItemUnits.itemId, [...itemIds]))
    .orderBy(asc(purchaseItemUnits.createdAt), asc(purchaseItemUnits.id))
    .all();
  for (const row of rows) {
    const bucket = grouped.get(row.itemId);
    if (bucket === undefined) grouped.set(row.itemId, [row]);
    else bucket.push(row);
  }
  return grouped;
}

/** A unit nobody has answered for. See this file's header. */
function isUndecided(unit: PurchaseItemUnitRow): boolean {
  return unit.inventoryItemUri === null && unit.inventoryDeclinedAt === null;
}

/**
 * How many slots a line has, and what each is worth.
 *
 * Shares are apportioned by `allocateProRata` at equal weight rather than
 * by dividing, so three units of a $10.00 line come back as 334c, 333c and
 * 333c and sum to the line exactly — the same property the shipping
 * allocation exists to hold. A line carrying more unit rows than its
 * quantity claims keeps every one of them: the rows are evidence, and
 * silently hiding one would hide a decision made against it.
 */
function slotPricesCents(line: ProposableLine, unitCount: number): number[] {
  const slots = Math.max(line.quantity, unitCount, 1);
  return allocateProRata(
    landedCostCents(line),
    Array.from({ length: slots }, () => 1)
  );
}

/**
 * Every unanswered inventory proposal on one order, in line order.
 *
 * An order with no durable lines, or one whose every durable unit is
 * decided, answers with an empty array — which is the same answer as an
 * order that does not exist. Callers that need to tell those apart read
 * the order first; this is a projection, not a lookup.
 */
export function listInventoryProposals(db: PurchasesDb, purchaseId: string): InventoryProposal[] {
  const order = db
    .select({
      orderedAt: purchases.orderedAt,
      merchantEntityName: purchases.merchantEntityName,
    })
    .from(purchases)
    .where(eq(purchases.id, purchaseId))
    .get();
  if (order === undefined) return [];

  const lines = listProposableLines(db, purchaseId);
  const units = unitsByItem(
    db,
    lines.map((line) => line.id)
  );
  const transactionUri = settlementTransactionUri(db, purchaseId);

  const proposals: InventoryProposal[] = [];
  for (const line of lines) {
    const lineUnits = units.get(line.id) ?? [];
    const prices = slotPricesCents(line, lineUnits.length);
    for (const [slot, price] of prices.entries()) {
      const unit = lineUnits[slot];
      if (unit !== undefined && !isUndecided(unit)) continue;
      proposals.push({
        purchaseId,
        itemId: line.id,
        unitId: unit?.id ?? null,
        slot,
        itemName: line.name,
        serialNumber: unit?.serialNumber ?? null,
        purchaseDate: order.orderedAt,
        purchasePriceCents: price ?? 0,
        purchasedFromName: order.merchantEntityName,
        purchaseTransactionUri: transactionUri,
        kindConfirmed: line.kindConfirmedAt !== null,
      });
    }
  }
  return proposals;
}

function findUndecidedUnit(
  db: PurchasesDb,
  itemId: string,
  unitId: string | undefined
): PurchaseItemUnitRow | undefined {
  const rows = db
    .select()
    .from(purchaseItemUnits)
    .where(eq(purchaseItemUnits.itemId, itemId))
    .orderBy(asc(purchaseItemUnits.createdAt), asc(purchaseItemUnits.id))
    .all();
  if (unitId === undefined) return rows.find(isUndecided);
  const named = rows.find((row) => row.id === unitId);
  if (named === undefined) return undefined;
  if (!isUndecided(named)) {
    throw new InventoryProposalConflictError(
      `Unit ${unitId} has already been accepted or declined; purchases has no way to retract an inventory decision`
    );
  }
  return named;
}

/**
 * Record what a human decided about one of the line's proposals.
 *
 * Returns undefined when the line does not exist on that order. The
 * two-part key is the same guard `confirmItemClassification` carries: ids
 * are random UUIDs, so a caller holding a line id but not its order is
 * guessing, and answering the guess would let a mistyped order id decide
 * for someone else's line.
 *
 * With no `unitId` the decision lands on the line's oldest undecided unit
 * row, and mints one when there is none — which is how a slot that never
 * needed identity gets it. A line whose units are all decided has nothing
 * left to answer for, so a further decision is a conflict rather than a
 * silent extra unit: that is what stops a double-submitted accept putting
 * two assets in inventory for one physical thing.
 */
export function decideInventoryProposal(
  db: PurchasesDb,
  purchaseId: string,
  itemId: string,
  input: InventoryProposalDecision
): PurchaseItemUnitRow | undefined {
  return db.transaction((tx) => {
    const line = tx
      .select({ id: purchaseItems.id, quantity: purchaseItems.quantity })
      .from(purchaseItems)
      .where(and(eq(purchaseItems.id, itemId), eq(purchaseItems.purchaseId, purchaseId)))
      .limit(1)
      .get();
    if (line === undefined) return undefined;

    const target = findUndecidedUnit(tx, itemId, input.unitId);
    if (target === undefined && input.unitId !== undefined) return undefined;

    const now = nowIso();
    const values =
      input.decision === 'accepted'
        ? { inventoryItemUri: input.inventoryItemUri, inventoryDeclinedAt: null }
        : { inventoryItemUri: null, inventoryDeclinedAt: now };

    if (target !== undefined) {
      return tx
        .update(purchaseItemUnits)
        .set(values)
        .where(eq(purchaseItemUnits.id, target.id))
        .returning()
        .get();
    }

    const existing = tx
      .select({ id: purchaseItemUnits.id })
      .from(purchaseItemUnits)
      .where(eq(purchaseItemUnits.itemId, itemId))
      .all();
    if (existing.length >= line.quantity) {
      throw new InventoryProposalConflictError(
        `Every unit of item ${itemId} has already been accepted or declined`
      );
    }
    return tx
      .insert(purchaseItemUnits)
      .values({ itemId, ...values })
      .returning()
      .get();
  });
}
