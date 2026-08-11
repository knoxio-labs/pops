# UI-level flows

One flow today: an unpaired launch types a pairing code, lands on the
transactions list, and opens a transaction's detail. It is the only test in
this client that exercises a screen the way somebody holding the phone does —
everything else stops at the view model.

## Running it

From the **repo root**, one command:

```bash
mise run e2e:ios
```

That boots a real `@pops/bfm` against a temporary SQLite database, points it at
a registry-and-finance fixture, builds the app if it needs building, installs
it on the simulator every other lane uses, mints a pairing code over the BFM's
own operator route, and runs the flow. `scripts/ios-e2e/run.mjs` is that
command and carries the reasoning for each part of it, including why it runs
the pillar with Node rather than Docker and why it does not use port 3014.

`mise run e2e:ios -- --serve-only` stops after booting: it prints a server
address and a live pairing code so the screens can be driven by hand.

`mise -C clients/ios run e2e` is the client's half on its own. It takes
`POPS_BFM_BASE_URL` and speaks nothing but HTTP to it, so it will drive the app
against any BFM — including a real deployment, if a pairing code can be minted
there.

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

So the flow asserts on identifiers where it is checking that something is
**there**, and on text only where the text is a fact rather than a phrasing —
`Account, Everyday` is a field label and a value the server sent.

The rows the flow expects come from `scripts/ios-e2e/transactions-fixture.mjs`.
Changing a description or an account there fails this flow, which is the point.

## What this flow does not prove

The BFM it runs against is real. The `finance` pillar behind it is not: a
fixture serves finance's own committed OpenAPI snapshot, so the routes and
operation ids the BFM resolves are finance's real ones, but the rows are
invented. What that leaves uncovered — the BFM's reading of a real finance
response — is covered in-process by
`pillars/bfm/src/api/__tests__/mobile-transactions.test.ts`, against the same
zod schemas. The seam this flow exists for is the phone's.

The recovery paths are not covered either, deliberately: a session that expires
mid-flow, a device revoked from the operator page, a BFM that cannot be
reached. Those are POPS-1817, and they are the obvious second flow.
