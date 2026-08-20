# BFMClient

The one way this app reaches the federation. Everything the phone knows about a pillar arrives through here, over HTTP, from the BFM.

Four things live in this package: the Swift client **generated** from the BFM's OpenAPI snapshot, the hand-written façade that wraps it, `BuiltInBaseURL`, which answers where the BFM is for a Debug build, and the repositories that turn a contract response into the vocabulary `AppCore` declares.

## The client is generated, committed, and gated

```bash
mise run generate:bfm-client   # re-vendor the contract, regenerate, from clients/ios
```

That one command does both halves, in order, because the half people forget is the copy.

**The contract is vendored.** [`clients/ios/Contracts/bfm.openapi.json`](../../Contracts/bfm.openapi.json) is a byte-identical copy of `pillars/bfm/openapi/bfm.openapi.json`, and the client is generated from the copy, never from the pillar's path. This app is not in the pnpm workspace and cannot depend on `@pops/bfm`, so per [ADR-033](../../../../docs/architecture/adr-033-cross-language-pillar-contracts.md) the snapshot itself is the cross-language contract and the consumer keeps its own copy inside its own boundary. Generating from the original would make that copy decorative — it could rot with nothing noticing.

Drift between the two is caught by [`scripts/ci/check-vendored-contracts.mjs`](../../../../scripts/ci/check-vendored-contracts.mjs), which scans `clients/*/Contracts` alongside the pillar apps' `app/contracts`. A copy kept anywhere else is invisible to it.

**The generated Swift is committed, and CI regenerates it and fails on any diff.** The `iOS Quality` workflow re-runs the command above and rejects the build if the result differs from what is in the tree — the same discipline [ADR-040](../../../../docs/architecture/adr-040-cross-pillar-contract-discipline.md) gives the TypeScript cross-pillar clients, which is why `pillars/bfm/openapi/**` is in that workflow's path filter. It is worth more here than anywhere else in the repo: this app is **distributed, not deployed**, so a producer change the client has not followed is not a broken deploy but a broken install on hardware nobody controls.

Generating at build time was the alternative. Committed output is reviewable, makes the diff check trivial, and keeps `xcodebuild` off a plugin that needs the network.

**The whole document is generated, including the `/operator/*` routes the phone will never call.** The generator's `filter` is include-only, so narrowing it means naming every phone-facing path in `openapi-generator-config.yaml` and keeping that list current — and the moment the list is what decides the client's contents, the diff gate stops proving the client tracks the contract and starts proving it tracks the list. The operator methods are `internal`, unreachable from any other module and unreferenced by the façade, so they are dead-stripped at link. Reconsider this when the operator surface grows enough that its churn is the reason a macOS CI job runs, not before.

## Why the generator is not a dependency of this package

It lives in [`Tools/OpenAPIGenerator`](../../Tools/OpenAPIGenerator/Package.swift), a manifest with no targets whose only job is to make `swift run swift-openapi-generator` resolvable.

Declaring it here instead would put a code generator and its four transitive dependencies into the dependency graph of a package the app links, so every `swift build` and every `xcodebuild -resolvePackageDependencies` would fetch them in order to compile an iPhone app that never runs a line of them. `ModuleBoundaryTests` in `AppCore` fails if any package under `Packages/` names the generator, because moving it back is a one-line edit that builds and tests clean.

The generator's SwiftPM **command plugin** was the obvious route and is not used: it writes to a `GeneratedSources/` directory that cannot be configured, and it requires the contract and its config to be copied _inside_ the target's sources — a third copy of a file whose whole point is that there is exactly one canonical version of it. The CLI takes `--output-directory` and reads the vendored copy where it already is.

Both the generator and the runtime are pinned with `exact:`. The generator version **is** the committed bytes; the Xcode project is generated and gitignored, so its `Package.resolved` is not committed and cannot be what pins the runtime. A range would let two contributors regenerate to two different files, and the second one to push would fail a gate with nothing in their change to explain it.

## Generated types do not leave this module

`openapi-generator-config.yaml` sets `accessModifier: internal`. That one line is the boundary: every generated type is unnameable from any other module, so regenerating the client can never turn into a cross-module refactor. What crosses the boundary is hand-written — `BFMHealth`, or an `AppCore` type a repository maps into.

Three things hold it, because the failure is silent — flipping that line produces a clean build, a clean lint and a green test run:

- `GeneratedSourcesTests` reads the generated files and fails on any `public`, `package` or `open` declaration.
- `ModuleBoundaryTests` in `AppCore` fails if any module other than this one imports `OpenAPIRuntime`, `OpenAPIURLSession` or `HTTPTypes` — the import a second, ungated client would need first.
- Both tests also assert the positive case, so neither can pass on a tree where the client was deleted.

`Generated/` is excluded from SwiftLint and from swift-format; the reasons are in [`.swiftlint.yml`](../../.swiftlint.yml) and [`scripts/swift-sources.sh`](../../scripts/swift-sources.sh), and `mise run lint` fails on generated code outside that directory and on hand-written code inside it.

## The façade

`BFMHTTPClient` takes a base URL and a transport. The public initialiser supplies `URLSessionTransport`; the internal one takes any `ClientTransport`, which is why no test here stubs `URLProtocol` — a `URLProtocol` subclass is process-global mutable state that survives a test that failed before tearing it down.

Two things it does that the generated client does not:

- **An undocumented status is an error.** The generator models any status the contract does not describe as a `.undocumented` case — a value, not a throw. Left alone, a 502 from a reverse proxy arrives at a call site as a successful call whose body nobody read.
- **The response becomes a domain type.** `BFMHealth` rather than `Operations.Health.Output.Ok.Body.JsonPayload`, whose name is a function of the contract and of the generator's naming strategy.

It carries no credentials of its own. `init(baseURL:)` reaches only the BFM's unauthenticated perimeter; `init(baseURL:middlewares:)` is how a caller hands it `Auth`'s `AuthenticatingMiddleware`, which is what a `/mobile/*` call needs. Nothing in this package knows which of the two it was given.

## The repositories

`BFMTransactionsRepository`, `BFMReceiptCaptureRepository` and `BFMBootstrapService` conform to `AppCore`'s `TransactionsRepository`, `ReceiptCaptureRepository` and `BootstrapService`. They are the reason this package depends on `AppCore` at all, and the reason `ModuleBoundaryTests` names it — with `Auth` — as one of the two packages allowed to hold a concrete implementation of a seam.

### Bootstrap

`GET /mobile/bootstrap` is the app's first authenticated call and the thing that keeps a phone from ever holding a list of what the federation contains. It asks.

Every enum the generator closed is reopened on the way through. The contract's feature ids, reachability states and registry sources are closed today, so the generator emits Swift enums — and a build compiled against today's contract is on a handset that will still be running it after the BFM has added a value. They cross into `AppCore` as raw-value wrappers, so an unrecognised one arrives intact and is skipped by whatever maps ids to screens rather than deciding what the whole app shows.

The response's `pillars` list is read and discarded. It is the federation's own observability; nothing on a phone screen is derived from it, and carrying it into `AppCore` would be a field that exists to be looked at in a debugger.

`502`/`503` resolve to `unavailable` rather than to a transport diagnostic, from either the undocumented-status branch or a body the client could not decode. The contract documents no gateway status for this route, so both paths are reachable and both mean the same thing: the BFM did not answer.

### Transactions

The mapping from wire to domain is the whole of it, and each leg is somewhere a wrong answer is silent:

- **Money.** The contract carries `amount` as a JSON `number`, so the generator emits a `Double`, and `MoneyAmount` holds integer minor units. The conversion goes through the shortest decimal string that round-trips the value — `Decimal(19.99)` is `19.989999999999998976` and scaling that yields 1998 cents, while `Decimal(string: "19.99")` is exact. A value with more precision than the currency has is refused rather than rounded: this app does not get to invent a rounding rule for money the finance pillar owns.
- **Dates.** `date` is typed as a bare string with no `format`, so what it means is a decision the contract does not state. It is read as `YYYY-MM-DD` and nothing else — parsed, then formatted back and compared, because a date-only `ISO8601FormatStyle` parses a leading date and ignores whatever follows it. The day is anchored at midnight in the reader's own zone, which is the zone the row is later formatted in; anchoring it in UTC renders the 5th as the 4th for everybody west of Greenwich.
- **Types.** `type` reaches `TransactionType` as a raw value, never through a Swift enum. It is the field the finance pillar is free to add to, and this build is on a phone somebody else owns.
- **Failures.** `unavailable` and `contractMismatch` do not converge. The BFM separates `upstream_unavailable` from `upstream_contract_mismatch` deliberately — "not answering" against "answered something this build cannot read" — and the list renders a different sentence and a different next action for each.
- **A stale cursor is not a failure.** `400 invalid_cursor` says the token this app holds is not one this server issued, and the server's own instruction is to start the list again. The repository does that rather than reporting it, which keeps the rows already on screen. It cannot recurse: the restart sends no cursor, and only a cursor that was sent can be rejected.

### Receipt capture

`POST /mobile/purchases/receipts` answers with one of three outcomes, and every one of them is a `200` — the BFM's own contract treats "purchases read this receipt and could not reconcile it" as an answer, not a failure. Only a call that never got that far throws.

Each arm carries what its screen draws: `created` the purchase summary the confirmation is built from, `needs-review` the gate's objections **and** the reading they are about. The one thing no arm carries is a photo reference — the stored parts are addressed by `pops://` URIs into the purchases pillar's own store and no mobile route serves those bytes, so `MobileReceiptOutcomeSchema` publishes `receiptCount` and `ReceiptOutcome` holds a count rather than a pointer this app could only ignore.

A `needs-review` problem's `code` is an open string on the wire, so a gate that grows a reason does not break a build already on a handset. `ReceiptGateFailureKind` matches that: the named cases are the ones with copy, and anything else becomes `.unrecognised(code)`, which still renders — the producer's own `detail` is the sentence a reviewer reads either way. Refusing the outcome instead would spend the wire's guarantee on nothing and tell somebody to update the app about a receipt that merely needs reviewing.

## Where the base URL comes from

`BuiltInBaseURL` resolves what a build ships with, which in Release is nothing — see [Where the BFM base URL comes from](../../README.md#where-the-bfm-base-url-comes-from). Nothing here constructs a `BFMHTTPClient` from it: that is the composition root's job, and it builds one per paired device from the base URL the pairing exchange stored, not from the built-in default. The built-in one is what the pairing form suggests in Debug, so simulator work does not have to type a host.

## Running the tests

```bash
swift test --package-path Packages/BFMClient
```
