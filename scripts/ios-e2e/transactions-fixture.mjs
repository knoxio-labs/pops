/**
 * The transactions the iOS flow sees, in the shape the finance pillar returns
 * them.
 *
 * These strings are asserted verbatim by
 * `clients/ios/.maestro/pairing-to-transaction-detail.yaml`, so editing one
 * here fails that flow. That is the intended coupling and not an accident: the
 * flow states what should be on screen, and this states what the server said.
 *
 * Every field here is one `pillars/finance/openapi/finance.openapi.json`
 * declares required on `transactions.list`/`transactions.get`'s 200 response —
 * see `requiredResponseFields` in `upstream-stub.mjs`, and the test in
 * `scripts/__tests__/ios-e2e-upstream-stub.test.ts` that checks every row
 * here against it. That check is what `accountId` going missing (POPS-4157)
 * should have failed instead of only showing up as a red Maestro flow twenty
 * minutes into a macOS job: `pillars/bfm/src/api/finance/wire.ts` has required
 * it on every row, not just the detail one, since POPS-3571, and this fixture
 * had not carried it at all. `date` is `YYYY-MM-DD` with no time component,
 * which is the one shape the BFM's schema narrows past what finance declares.
 *
 * `accountId` names the account in `accounts-fixture.mjs` — resolving it is
 * what makes the flow's last assertion meaningful: `Account, Everyday` is
 * only on screen if the detail screen's account lookup actually ran, and
 * `location`/`country` are returned by the detail call and by nothing else,
 * so a screen showing them fetched the full record rather than one still
 * drawing the row the list handed it.
 */
import { EVERYDAY_ACCOUNT_ID } from './accounts-fixture.mjs';

export const seededTransactions = [
  {
    id: 'e2e-groceries',
    description: 'Woolworths Metro',
    accountId: EVERYDAY_ACCOUNT_ID,
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
    foreignAmountMinor: null,
    foreignCurrency: null,
    fxFeeCents: null,
    fxCaptureSource: null,
    lastEditedTime: '2026-03-03T10:00:00.000Z',
  },
  {
    id: 'e2e-salary',
    description: 'Knoxio Labs payroll',
    accountId: EVERYDAY_ACCOUNT_ID,
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
    foreignAmountMinor: null,
    foreignCurrency: null,
    fxFeeCents: null,
    fxCaptureSource: null,
    lastEditedTime: '2026-03-02T09:00:00.000Z',
  },
  {
    id: 'e2e-coffee',
    description: 'Proud Mary Coffee',
    accountId: EVERYDAY_ACCOUNT_ID,
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
    foreignAmountMinor: null,
    foreignCurrency: null,
    fxFeeCents: null,
    fxCaptureSource: null,
    lastEditedTime: '2026-03-01T08:15:00.000Z',
  },
];
