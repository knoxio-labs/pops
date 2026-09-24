# @pops/app-finance

The frontend module for the finance pillar, mounted by `pillars/shell` at
`/finance` through the runtime loader (`src/bundles.ts`, built by
`vite.remote.config.ts`). It talks to three contracts through generated Hey
API clients: finance's own (`src/finance-api`), and the vendored contacts and
purchases snapshots under `contracts/` (`src/contacts-api`, `src/purchases-api`).

## Running it on its own

```sh
pnpm --filter @pops/app-finance dev:standalone   # http://localhost:5572
```

No shell, no finance, contacts or purchases pillar, no database. Every page on
finance's wire `pages` list renders against fixtures, through the same route
table and the same components the shell mounts — there is no standalone-only
fork of anything (POPS-4587). `build:standalone` builds the same thing as a
static bundle.

**Mocks are on unless you say otherwise.** `VITE_FINANCE_API=real` sends all
three clients' requests through the dev server's `/finance-api`,
`/contacts-api` and `/purchases-api` proxies (ports 3004, 3010 and 3013, the
shell's) to pillars you are running yourself:

```sh
VITE_FINANCE_API=real pnpm --filter @pops/app-finance dev:standalone
```

A proxy error in the console while mocked means the switch is set to `real`
and a pillar is not up.

### Contacts absent

```sh
VITE_CONTACTS_API=absent pnpm --filter @pops/app-finance dev:standalone
```

Every contacts operation then answers the registry's `pillar-unavailable`
(`{ kind, moduleId, reason }`) under a 503, while finance and purchases keep
answering. It drives the app's own degrade path, not a harness one:
`isUnavailableError` in `src/contacts-api-helpers.ts` classifies the failure,
and `/finance/entities/:id` falls back to the name finance stored with the
entity's transactions and its transaction and purchase roll-ups, leaving out
what only contacts holds. Transactions show their stored `entityName` label
and link no entity in either mode. The switch applies to the mocked mode.

### What the mock layer is

`src/standalone/mock/` installs `installApiMock` from
`@pops/pillar-sdk/testing/api-mock` once per contract. It intercepts `fetch`,
not the clients, so the generated clients and this app's error handling run
exactly as they do against the pillars.

Handlers are keyed by the operations each **OpenAPI document** declares
(`'GET /accounts/{id}'`), not by the calls the app makes today.
`mock/handlers.test.ts` checks all three sets against their documents in both
directions with `contractCoverage`: a new endpoint cannot ship without an
answer, and a handler cannot outlive its operation. An operation with no
handler answers a 501 the page renders through its ordinary error path.

### Adding a fixture

Fixtures live in `src/standalone/fixtures/`, typed against the generated
`*Responses[200]` types and fictional throughout. Point a handler at one in
the matching `src/standalone/mock/` file, then give the page an expectation in
`standalone.test.tsx` that only the fixture can satisfy.

Choose data that shows the page's reasoning rather than the smallest payload
that typechecks. The existing ones do: the rewards card's August checkpoint
disagrees with its ledger by -$32.50; the everyday account's September import
carries a row skipped as a duplicate; one grocer transaction was saved against
no entity and the correction proposal reattributes it; Harbour Grocer has
transactions and a linked purchase, and Kestrel Bank has none.

## Run

```sh
pnpm --filter @pops/app-finance typecheck          # tsc --noEmit
pnpm --filter @pops/app-finance test               # vitest run
pnpm --filter @pops/app-finance build              # the remote bundle
pnpm --filter @pops/app-finance dev:standalone     # the app alone, on mocks
pnpm --filter @pops/app-finance build:standalone   # the standalone bundle
```
