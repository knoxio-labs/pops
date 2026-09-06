/**
 * The two rollups an entity details page reaches out for (POPS-3067): recent
 * transactions from finance, recent purchases from purchases. Deliberately
 * not on the `Entity` fixture itself — that model is contacts' own, and these
 * are each a call to a different pillar. One entity page paying for two such
 * calls is fine; the entities *list* paying for one per row is the thing
 * this split exists to keep impossible to reach for by accident.
 */
export interface RecentTransaction {
  id: string;
  date: string;
  description: string;
  amountCents: number;
}

export interface RecentPurchase {
  id: string;
  date: string;
  item: string;
  amountCents: number;
}

export const recentTransactionsByEntity: Record<string, RecentTransaction[]> = {
  e1: [
    { id: 't1', date: '2026-09-04', description: 'Woolworths Metro', amountCents: -4820 },
    { id: 't2', date: '2026-09-01', description: 'Woolworths', amountCents: -13245 },
    { id: 't3', date: '2026-08-27', description: 'Woolworths', amountCents: -8790 },
  ],
  e3: [{ id: 't4', date: '2026-07-28', description: 'ATO PAYG instalment', amountCents: -320000 }],
  e4: [{ id: 't5', date: '2026-08-31', description: 'Monthly account fee', amountCents: -500 }],
  e9: [
    { id: 't6', date: '2026-09-02', description: 'Bunnings Warehouse', amountCents: -6499 },
    { id: 't7', date: '2026-08-19', description: 'Bunnings Warehouse', amountCents: -18990 },
  ],
};

export const recentPurchasesByEntity: Record<string, RecentPurchase[]> = {
  e9: [
    { id: 'p1', date: '2026-08-19', item: 'BILLY bookcase, white', amountCents: -12900 },
    { id: 'p2', date: '2026-08-19', item: 'Potting mix, 30L', amountCents: -1499 },
  ],
  e7: [{ id: 'p3', date: '2026-06-02', item: 'MALM bed frame', amountCents: -29900 }],
};
