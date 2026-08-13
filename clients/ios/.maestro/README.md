# UI-level flows

The only tests in this client that exercise a screen the way somebody holding
the phone does — everything else stops at the view model. One happy path and
five recoveries, each starting from an unpaired launch:

| Flow                                            | What it proves                                                                                                                    |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `pairing-to-transaction-detail.yaml`            | A pairing code reaches the list, and a row reaches the full record behind it.                                                     |
| `expired-session-refreshes-silently.yaml`       | A refused access token is renewed and the request retried, with nothing on screen.                                                |
| `revoked-device-returns-to-pairing.yaml`        | A revoked device lands back on pairing, saying which of the two reasons it was.                                                   |
| `unreachable-transactions-say-so.yaml`          | Transactions that cannot be fetched say so instead of reading as an empty list.                                                   |
| `root-says-so-when-nothing-is-usable.yaml`      | A feature the BFM reports `unavailable` never opens its screen; the root says so and Try again leaves it once the pillar answers. |
| `root-contract-mismatch-reads-differently.yaml` | A pillar answering something unreadable reads as a different sentence from `unavailable`, not the same one.                       |

## Running them

From the **repo root**, one command:

```bash
mise run e2e:ios
```

That boots a real `@pops/bfm` against a temporary SQLite database, points it at
a registry-and-finance fixture, starts the control plane the recovery flows
throw their switches through, builds the app if it needs building, installs it
on the simulator every other lane uses, and runs each flow against a pairing
code minted for it over the BFM's own operator route.
`scripts/ios-e2e/run.mjs` is that command and carries the reasoning for each
part of it, including why it runs the pillar with Node rather than Docker and
why it does not use port 3014.

`mise run e2e:ios -- --serve-only` stops after booting: it prints both server
addresses and a live pairing code so the screens can be driven by hand.

`mise -C clients/ios run e2e` is the client's half on its own. It takes
`POPS_BFM_BASE_URL` and `POPS_E2E_CONTROL_URL` and speaks nothing but HTTP to
either. Both are required rather than one being optional, because a lane that
quietly drives one flow instead of six reports the same green as a lane that
drove all of them.

**The flows are found, not listed.** The task globs `.maestro/*.yaml`, so a new
flow runs without anything being added anywhere — and an empty glob fails the
lane rather than passing it having driven nothing.

That glob is one directory deep, which is what keeps `subflows/` out of it.
Everything in there is called through `runFlow` and takes values from its
caller, so driven on its own it would fail on the ones nobody passed it.

## Why Maestro and not XCUITest

Decided 2026-08-10. Recorded here so it is not reopened every time someone
notices Apple ships a UI-testing framework in the box.

- **The flow is the artefact, not the code around it.** This directory is
  YAML — a list of taps and assertions anybody can read without knowing Swift
  or XCTest. The XCUITest equivalent is a target, a `XCUIApplication`
  lifecycle, a query language, and a `waitForExistence` on every element.
- **Waiting is built in.** Maestro retries an assertion until it holds. The
  flake class XCUITest is known for is the one where a test races the animation
  that follows a tap, and the usual fix — a sleep, or a timeout large enough to
  cover the worst machine — is exactly what this repo rejects. There is no
  `sleep` in this directory and there should never be one.
- **It does not lengthen the `xcodebuild` lane.** A UI-test target would be
  another testable in the `Pops` scheme, compiled by the same
  `build-for-testing` that POPS-1645 and POPS-1683 spent their effort making
  cheaper. Maestro drives the built `.app` and compiles nothing.

**Maestro is a test-time tool, installed by mise and pinned in
`clients/ios/mise.toml`.** It is not linked into the app and appears in no
`Package.swift`, so it does not touch the decision that this client ships zero
third-party runtime dependencies.

What it costs, stated plainly: a second tool with its own release cadence, a
JVM to run it, and a matching language that is not Swift. The pin is what keeps
the first of those from arriving as a red required check with no commit behind
it.

## What the flow keys on

Accessibility identifiers, declared in `PairingAccessibility.swift` and
`TransactionsAccessibility.swift` beside the views that carry them. **None
existed before this flow** — the screens had accessibility _labels_, which are
the sentences VoiceOver speaks, and those are the wrong thing to key a test on:
they are prose, they change when the copy does, and on a list row they include
an amount and a date formatted for the device's locale.

So a flow asserts on identifiers where it is checking that something is
**there**, and on text only where the text is a fact rather than a phrasing —
`Account, Everyday` is a field label and a value the server sent.

The recovery flows are the exception, and deliberately: the sentence **is** the
requirement. Being returned to the pairing screen with no explanation is
indistinguishable from the app having lost its mind, and an empty transactions
list and an unreachable one are the same pixels with opposite meanings. Those
flows assert the sentences from `PairingCopy.explanation(for:)` and
`TransactionsCopy.message(for:)` verbatim, and assert the neighbouring sentence
is absent — a copy edit that merges two of them is exactly the regression worth
failing on.

**A text selector is a regex matched against the WHOLE label**, which is the
trap worth knowing before writing one: a prefix of a sentence matches nothing,
so `assertVisible` on it fails against a screen that is showing exactly that
sentence, and `assertNotVisible` on it passes against anything at all. Quote
the sentence in full, or spell the `.*` deliberately — the expiry flow does the
second, because the detail screen composes its lead-in with a second sentence
naming the failure.

**Only `assertVisible` waits.** `assertNotVisible` answers the moment the
element is absent, which a screen mid-transition always is, so a negative
assertion is worth only as much as the positive one in front of it. Every
`assertNotVisible` here sits behind an `assertVisible` that settles the screen
first; moving one above it turns it into a line that cannot fail.

**Typing does not wait either, and that is the sharper edge of the same rule.**
`inputText` is not addressed to a field: it types into whatever holds keyboard
focus, and `tapOn` returns once the tap has been delivered rather than once the
tapped field has become first responder. On a loaded machine the keystrokes can
arrive first, and iOS drops them — both commands report `COMPLETED`, the field
keeps what it already held, and the flow fails much later on something that
reads like an unrelated bug. This is not hypothetical: it is what
`expired-session-refreshes-silently.yaml` failed on in the merge queue, as a
`transactions-list` that was never going to appear, because the server field
still held the Debug prefill and pairing had dialled a port nothing was
listening on.

So the pairing preamble lives in `subflows/enter-the-pairing-details.yaml`,
where every field's value is asserted after it is typed and the typing is
retried until it lands. Anything else that types into this app should do the
same. Maestro's `focused` selector looks like the signal to wait on and is not:
it is mapped from XCUITest's `hasFocus`, the focus engine's notion, which reads
false on a SwiftUI `TextField` that is holding the keyboard.

The rows the flows expect come from `scripts/ios-e2e/transactions-fixture.mjs`.
Changing a description or an account there fails them, which is the point.

## The seams the recovery flows throw

A Maestro flow can reach exactly one thing outside the phone: an HTTP endpoint,
through `runScript`. So each seam is one, and they live in
`scripts/ios-e2e/control-plane.mjs` — a harness process that forwards
everything except `/__e2e/*` to the same real BFM. The recovery flows pair
against it; the happy path still dials the pillar directly. The scripts that
call the seams are in `scripts/` beside the flows, one per switch.

- **An expired session** ages one request's bearer token. The harness owns the
  signing secret, so it can mint a token of the same device with a real past
  `exp`, and the pillar's own `verifyAccessToken` answers the 401.
  `scripts/ios-e2e/aged-access-token.mjs` argues for that over shortening
  `ACCESS_TOKEN_TTL_SECONDS`, on both security and determinism.
- **A revoked device** is revoked through the BFM's own
  `DELETE /operator/devices/:id`, the route the operator's Devices page calls —
  not a write into the temp database, which would skip the half of the story
  that is the route.
- **Unreachable transactions** are finance refusing its data routes while still
  serving the registry and its `/openapi`. `scripts/ios-e2e/upstream-stub.mjs`
  explains why the obvious version — closing the whole stub — puts a different
  screen in front of the assertion.
- **Nothing usable at all** — the root screen, not the transactions one — is
  `/openapi` resetting the connection instead of answering, while the registry
  keeps reporting finance registered and healthy. `scripts/ios-e2e/upstream-stub.mjs`
  argues for driving this through the live probe rather than the registry's
  own verdict: the latter is cached process-wide for up to thirty seconds, so
  proving `Try again` recovers would need a wait this suite refuses to add.
- **A contract mismatch** is the same `/openapi` answering 200 with a body
  that is not JSON — a misrouted proxy's signature, and the one case that must
  read as a different sentence from "nothing usable at all" rather than the
  same one.

A silent recovery leaves no mark on a screenshot, so the expiry flow finishes
by reading `GET /__e2e/state` back: one token aged, one refresh spent. Without
it every assertion in that flow would also hold if the arming had done nothing.

## What these flows do not prove

The BFM they run against is real. The `finance` pillar behind it is not: a
fixture serves finance's own committed OpenAPI snapshot, so the routes and
operation ids the BFM resolves are finance's real ones, but the rows are
invented. What that leaves uncovered — the BFM's reading of a real finance
response — is covered in-process by
`pillars/bfm/src/api/__tests__/mobile-transactions.test.ts`, against the same
zod schemas. The seam these flows exist for is the phone's.

Nothing here covers the registry's OWN verdict on a pillar — `registered:
false` or `status: 'unavailable'` in `/registry/pillars`, read by
`registryVeto` before the BFM asks the pillar anything at all — and nothing
needs to. That arm has its own unit coverage in
`pillars/bfm/src/api/mobile/__tests__/reachability.test.ts`, and the wire
value it produces is the same `reachability: 'unavailable'` the probe-timeout
arm above produces. `ContentView.swift` passes the withheld features straight
through to `RootCopy.swift`, and `RootCopy` is the only code that reads a
`FeatureAvailability`'s `FeatureReachability` — neither ever asks which of the
two signals set it, so a flow that drove the registry branch would exercise
the exact same client code the two flows above already do. Driving it anyway
would need the registry-discovery cache invalidated mid-flow, and there is no
way to do that here without either adding the BFM a route that exists for a
test, or waiting out the discovery cache's 5-second enforced floor
(`MIN_CACHE_TTL_MS` in `@pops/pillar-sdk/discovery`) — the one thing this
suite refuses to do.
