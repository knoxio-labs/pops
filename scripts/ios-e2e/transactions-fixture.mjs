/**
 * The transactions the iOS flow sees, in the shape the finance pillar returns
 * them.
 *
 * These strings are asserted verbatim by
 * `clients/ios/.maestro/pairing-to-transaction-detail.yaml`, so editing one
 * here fails that flow. That is the intended coupling and not an accident: the
 * flow states what should be on screen, and this states what the server said.
 *
 * Every field the BFM reads is present on every row — `pillars/bfm/src/api/finance/wire.ts`
 * requires the detail fields as well as the list ones, and a missing one is a
 * 502 rather than a partial record. `date` is `YYYY-MM-DD` with no time
 * component for the same reason.
 *
 * Chosen to make the flow's last assertion meaningful: `account`, `location`
 * and `country` are returned by the detail call and by nothing else, so a
 * screen showing them is a screen that fetched the full record rather than one
 * still drawing the row the list handed it.
 */
export const seededTransactions = [
  {
    id: 'e2e-groceries',
    description: 'Woolworths Metro',
    account: 'Everyday',
    amount: -42.5,
    date: '2026-03-03',
    type: 'purchase',
    tags: ['groceries'],
    entityId: 'e2e-entity-woolworths',
    entityName: 'Woolworths',
    location: 'Fitzroy',
    country: 'AU',
    relatedTransactionId: null,
    notes: null,
    lastEditedTime: '2026-03-03T10:00:00.000Z',
  },
  {
    id: 'e2e-salary',
    description: 'Knoxio Labs payroll',
    account: 'Everyday',
    amount: 4200,
    date: '2026-03-02',
    type: 'income',
    tags: [],
    entityId: 'e2e-entity-knoxio',
    entityName: 'Knoxio Labs',
    location: null,
    country: 'AU',
    relatedTransactionId: null,
    notes: null,
    lastEditedTime: '2026-03-02T09:00:00.000Z',
  },
  {
    id: 'e2e-coffee',
    description: 'Proud Mary Coffee',
    account: 'Everyday',
    amount: -6.5,
    date: '2026-03-01',
    type: 'purchase',
    tags: ['coffee', 'eating-out'],
    entityId: 'e2e-entity-proud-mary',
    entityName: 'Proud Mary',
    location: 'Collingwood',
    country: 'AU',
    relatedTransactionId: null,
    notes: null,
    lastEditedTime: '2026-03-01T08:15:00.000Z',
  },
];
