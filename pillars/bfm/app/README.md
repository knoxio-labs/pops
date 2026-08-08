# @pops/app-bfm

The frontend module for the **bfm** (Backend-for-Mobile) pillar. It registers
the `/bfm` route with `pillars/shell` and renders the operator's device
surface.

The rail entry reads **Devices**. `bfm` stays the pillar id everywhere in code
— package name, manifest id, `navConfig.id`, the `/bfm` base path — but the
acronym means nothing to a human, and the surface is a list of paired phones.
The `ai` pillar carries the same split (id `ai`, name "AI Ops").

The surface lives in the shell rather than on the phone on purpose: the shell
already sits behind Cloudflare Access, which is what makes "only the operator
can mint a pairing code" true.

Frontend-only: this package owns no database. Everything goes over the bfm
pillar's REST contract through the generated `@hey-api/client-fetch` client in
`src/bfm-api/`, served at the shell's `/bfm-api` proxy path
(see `src/bfm-api-runtime-config.ts`). Because the app consumes its **own**
pillar, there is no cross-pillar client leg and nothing to add to the
`cross-pillar-clients` CI job.

## Layout

```
src/
  index.ts                    entrypoint — re-exports manifest, navConfig, routes
  manifest.ts                 ModuleManifest (id='bfm')
  routes.tsx                  route table + navConfig
  bfm-api/                    generated Hey API client (do not hand-edit)
  bfm-api-helpers.ts          unwrap() + isUnavailableError()
  bfm-api-runtime-config.ts   client baseUrl ('/bfm-api')
  pages/
    DevicesPage.tsx           /bfm — composition only
    devices-page/             the model and the three surfaces it drives
```

`bfm-api-helpers.ts` is deliberately a per-pillar copy rather than a shared
import: what counts as "unavailable" is a pillar-local judgement and the SDK
does not own that classification.

## The pairing code's lifetime

bfm hands the plaintext back exactly once and persists only its digest, so on
this side the code exists in one `useState` cell in `usePairingCode` and
nowhere else. Three consequences that are easy to undo by accident:

- It is **not** read back out of React Query. The mutation is `reset` as soon
  as its payload has been copied into state, so the string does not linger in
  the mutation cache after the dialog closes.
- Closing the dialog, or the deadline passing, clears the cell — the expired
  code is dropped, not merely hidden. A dead code left on screen looking valid
  is the failure this is built to avoid, which is also why an `expiresAt` that
  will not parse counts as _already_ expired rather than as no deadline.
- Dismissal wins against a request still in flight. `usePairingCode` keeps a
  mint nonce that `dismiss` bumps, so a response that lands after the operator
  closed the dialog is discarded instead of putting the plaintext back into
  state — where it would be invisible, but alive, with a countdown running
  against a code nobody is looking at. The same nonce is why a superseded mint
  cannot overwrite a newer one.
- Nothing writes it to `localStorage`, the URL, or a log line. Reloading the
  page means minting another; there is nothing to recover.

The QR encodes `pairingUrl`, never the bare `code`. The handset ships without
a hostname and learns where its bfm lives from what it scans (see
[`BuiltInBaseURL.swift`](../../../clients/ios/Packages/BFMClient/Sources/BFMClient/BuiltInBaseURL.swift)),
so a code-only QR would scan perfectly and pair nothing.

## Failure shapes

Both the device list and minting split failures three ways, because they send
the operator after different bugs:

| Shape        | Meaning                                                            |
| ------------ | ------------------------------------------------------------------ |
| Unavailable  | No status, or 5xx — the pillar is down.                            |
| Rate limited | 429 on issuance — the budget is spent; the fix is to wait.         |
| Refused      | A status the pillar chose (401, 404 …) — Access/routing, not down. |

Collapsing the last into "Unavailable" would send the operator after the wrong
bug. Revocation keeps its dialog open on any of them: the handset stays
trusted until the call succeeds, and a dialog that closes reads as "done".

It also refuses to close _during_ the request. Cancel and the action are
disabled then, but Escape reaches Radix regardless, and the DELETE is already
on the wire and cannot be called back — so a dialog that vanished would read
as cancelled while the revocation went ahead, and a failure arriving after it
would render into a dialog that no longer exists, losing the only message that
says the handset is still trusted. The refusal lives in `useRevocation`, not in
the dialog: a guard written against the rendered `isRevoking` reads a value one
commit behind the click, which real Chromium loses and jsdom does not.

## Tests

`src/pages/__tests__/DevicesPage.test.tsx` drives the whole page against a
mocked generated SDK — `unwrap` and `isUnavailableError` run for real. Exact
TTL formatting is pinned separately in
`src/pages/devices-page/__tests__/pairing-ttl.test.ts`, where the clock is a
function argument: the page test needs `shouldAdvanceTime` for React Query to
settle, which lets real milliseconds into the fake clock and makes an exact
readout assertion flaky.

The browser-level walkthrough is `pillars/shell/e2e/bfm-devices-pairing.spec.ts`.
It stubs bfm's operator routes itself rather than using
`e2e/helpers/use-real-api`, so it does not depend on the harness rewrite that
suite is waiting on (POPS-1311) — but that suite is gated to
`workflow_dispatch`, so this spec does not run in CI until POPS-1311 lands.

## Run

```sh
pnpm --filter @pops/app-bfm typecheck
```

```sh
pnpm --filter @pops/app-bfm test
```

```sh
pnpm --filter @pops/app-bfm generate:api
```

The generated client under `src/bfm-api/` is produced from
`pillars/bfm/openapi/bfm.openapi.json` and must not be edited by hand.
Regenerate it with `generate:api` after the contract changes — the same spec
the generated Swift client is built from, so the two clients cannot disagree
about the wire.

## Install gate

`@pops/app-bfm` exposes a single `.` export — `manifest`, `navConfig` and
`routes`, all browser-safe. `pillars/shell` imports the `manifest` and gates
mounting on its `POPS_APPS` selection: adding `bfm` mounts the module at
`/bfm`, removing it hides those routes. No data lives in this package, so
uninstalling only removes the UI — device and token rows stay in the bfm
pillar.

## Docs

- Pillar overview: [`pillars/bfm/README.md`](../README.md)
