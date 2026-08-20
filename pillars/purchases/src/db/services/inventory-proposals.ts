/**
 * Proposing inventory assets from durable line items.
 *
 * **Propose, never create.** Nothing here writes into `inventory`. A
 * proposal is a projection of rows purchases already holds, named after
 * inventory's own fields where it has them; the write into inventory
 * belongs to whoever is holding the human's consent, and purchases learns
 * about it afterwards through `inventory-proposal-decisions.ts`. Fanning
 * out automatically fills inventory with cables, batteries and light globes
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

import { isResidualBearing, SETTLEMENT_ROLES } from '../../contract/constants.js';
import { allocateProRata } from '../../ingest/allocation.js';
import { purchaseChargeLinks, purchaseCharges } from '../schema/charges.js';
import { purchaseItems, purchaseItemUnits } from '../schema/items.js';
import { purchases, purchaseShipments } from '../schema/purchases.js';
import { landedCostCents } from './accounting.js';

import type { SettlementRole, ShipmentStatus } from '../../contract/constants.js';
import type { PurchaseItemUnitRow } from '../schema.js';
import type { PurchasesDb } from './internal.js';

/**
 * Shipment states in which the goods were never received. A line on one of
 * these is not an asset, whatever the merchant charged for it.
 */
const UNRECEIVED_SHIPMENT_STATUSES: readonly ShipmentStatus[] = ['cancelled', 'returned'];

/**
 * Charge roles that paid for the goods, which is what "settled against one
 * transaction" has to count.
 *
 * A `refund` is money coming back and an `authorization` is a hold its own
 * capture records again — both are transactions of the order without being
 * settlements of it, and {@link settlementTransactionUri} answers null the
 * moment it sees a second URI. Counting either would strip the transaction
 * link from exactly the orders most likely to carry a durable asset: one
 * refunded in part, and one whose bank recorded the hold as its own row.
 * The same pair `accounting.ts` excludes, expressed the same way.
 */
const SETTLING_ROLES: readonly SettlementRole[] = SETTLEMENT_ROLES.filter(
  (role) => isResidualBearing(role) && role !== 'refund'
);

/**
 * One unanswered offer to inventory.
 *
 * Field names follow inventory's where a counterpart exists, so most of
 * the payload needs no translation. Three do not map, and a caller that
 * posts this straight to that pillar's `POST /items` should know which:
 *
 *   `purchasePriceCents`     inventory's `purchasePrice` is a float dollar
 *                            amount; purchases mints no float anywhere, so
 *                            dividing by 100 is the caller's step
 *   `purchaseTransactionUri` inventory's create body has no URI field, so
 *                            this key is dropped on the floor there — send
 *                            the bare id instead, which that pillar derives
 *                            `home_inventory.purchase_transaction_uri` from
 *   `serialNumber`           inventory holds no such column
 *
 * The last two are carried anyway because they are the strongest facts
 * purchases has about the asset, and a field withheld until its reader
 * exists is a field nobody builds the reader for.
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
  /**
   * This unit's share of what the line actually cost: its landed cost less
   * whatever came back on it. The shares of a line sum to that figure
   * exactly.
   */
  readonly purchasePriceCents: number;
  readonly purchasedFromName: string | null;
  /**
   * `pops://finance/transaction/<id>`, when the order was paid for by
   * exactly one transaction a human confirmed. Null otherwise, and both
   * halves of that matter: an unconfirmed link is the matcher's proposal
   * and not a fact, and an order spanning two payments has no single one to
   * name — inventory's column holds one URI, so guessing which would file
   * the asset against half its own payment. Refunds and card holds are not
   * payments and do not count as a second one; see {@link SETTLING_ROLES}.
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
 * refund kept the goods and gave some money back, so the line still
 * proposes and {@link slotPricesCents} prices it net of what came back.
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
 * Confirmed links only, and only on a charge in a {@link SETTLING_ROLES}
 * role. The sweep tears down and rewrites every unconfirmed link on each
 * run, so one of those is a candidate the engine currently likes rather
 * than a settlement anyone has agreed to.
 */
function settlementTransactionUri(db: PurchasesDb, purchaseId: string): string | null {
  const rows = db
    .selectDistinct({ uri: purchaseChargeLinks.transactionUri })
    .from(purchaseChargeLinks)
    .innerJoin(purchaseCharges, eq(purchaseChargeLinks.chargeId, purchaseCharges.id))
    .where(
      and(
        eq(purchaseCharges.purchaseId, purchaseId),
        isNotNull(purchaseChargeLinks.confirmedAt),
        inArray(purchaseCharges.role, [...SETTLING_ROLES])
      )
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

/**
 * A unit nobody has answered for — neither in inventory nor declined. The
 * definition of *decided* this file's header turns on, exported so the
 * write half cannot drift into a second one.
 */
export function isUndecided(unit: PurchaseItemUnitRow): boolean {
  return unit.inventoryItemUri === null && unit.inventoryDeclinedAt === null;
}

/**
 * How many slots a line has, and what each is worth.
 *
 * Landed cost less refunds, which is what the thing cost the household and
 * therefore what an insurance or resale figure should read. `accounting.ts`
 * derives `netSpendCents` at the order level for the same reason it is
 * derived here rather than left to the caller: several consumers netting
 * refunds independently is several chances to disagree, and this payload
 * does not even carry the refund for one to net with. It is not clamped at
 * zero — an over-refunded line is worth seeing rather than hiding (ADR-042)
 * — though a line refunded past its own total is excluded before it gets
 * here.
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
    landedCostCents(line) - line.refundedCents,
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
        purchasePriceCents: price,
        purchasedFromName: order.merchantEntityName,
        purchaseTransactionUri: transactionUri,
        kindConfirmed: line.kindConfirmedAt !== null,
      });
    }
  }
  return proposals;
}
