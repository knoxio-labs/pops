# BFMClient

The one way this app reaches the federation. Everything the phone knows about a pillar arrives through here, over HTTP, from the BFM.

Three things live in this package: the Swift client **generated** from the BFM's OpenAPI snapshot, the hand-written façade that wraps it, and `BuiltInBaseURL`, which answers where the BFM is for a Debug build.

## The client is generated, committed, and gated

```bash
mise run generate:bfm-client   # re-vendor the contract, regenerate, from clients/ios
```

That one command does both halves, in order, because the half people forget is the copy.

**The contract is vendored.** [`clients/ios/Contracts/bfm.openapi.json`](../../Contracts/bfm.openapi.json) is a byte-identical copy of `pillars/bfm/openapi/bfm.openapi.json`, and the client is generated from the copy, never from the pillar's path. This app is not in the pnpm workspace and cannot depend on `@pops/bfm`, so per [ADR-033](../../../../docs/architecture/adr-033-cross-language-pillar-contracts.md) the snapshot itself is the cross-language contract and the consumer keeps its own copy inside its own boundary. Generating from the original would make that copy decorative — it could rot with nothing noticing.

Drift between the two is caught by [`scripts/ci/check-vendored-contracts.mjs`](../../../../scripts/ci/check-vendored-contracts.mjs), which scans `clients/*/Contracts` alongside the pillar apps' `app/contracts`. A copy kept anywhere else is invisible to it.

**The generated Swift is committed, and CI regenerates it and fails on any diff.** The `iOS Quality` workflow re-runs the command above and rejects the build if the result differs from what is in the tree — the same discipline [ADR-040](../../../../docs/architecture/adr-040-cross-pillar-contract-discipline.md) gives the TypeScript cross-pillar clients, which is why `pillars/bfm/openapi/**` is in that workflow's path filter. It is worth more here than anywhere else in the repo: this app is **distributed, not deployed**, so a producer change the client has not followed is not a broken deploy but a broken install on hardware nobody controls.

Generating at build time was the alternative. Committed output is reviewable, makes the diff check trivial, and keeps `xcodebuild` off a plugin that needs the network.

## Why the generator is not a dependency of this package

It lives in [`Tools/OpenAPIGenerator`](../../Tools/OpenAPIGenerator/Package.swift), a manifest with no targets whose only job is to make `swift run swift-openapi-generator` resolvable.

Declaring it here instead would put a code generator and its four transitive dependencies into the dependency graph of a package the app links, so every `swift build` and every `xcodebuild -resolvePackageDependencies` would fetch them in order to compile an iPhone app that never runs a line of them. `ModuleBoundaryTests` in `AppCore` fails if any package under `Packages/` names the generator, because moving it back is a one-line edit that builds and tests clean.

The generator's SwiftPM **command plugin** was the obvious route and is not used: it writes to a `GeneratedSources/` directory that cannot be configured, and it requires the contract and its config to be copied _inside_ the target's sources — a third copy of a file whose whole point is that there is exactly one canonical version of it. The CLI takes `--output-directory` and reads the vendored copy where it already is.

Both the generator and the runtime are pinned with `exact:`. The generator version **is** the committed bytes; the Xcode project is generated and gitignored, so its `Package.resolved` is not committed and cannot be what pins the runtime. A range would let two contributors regenerate to two different files, and the second one to push would fail a gate with nothing in their change to explain it.

## Generated types do not leave this module

`openapi-generator-config.yaml` sets `accessModifier: internal`. That one line is the boundary: every generated type is unnameable from any other module, so regenerating the client can never turn into a cross-module refactor. What crosses the boundary is hand-written — `BFMHealth` today, one value type per response shape as the contract grows.

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

It carries no credentials. Attaching and refreshing an access token is a `ClientMiddleware` that does not exist yet, so every call from here reaches only the BFM's unauthenticated perimeter.

## Where the base URL comes from

`BuiltInBaseURL` resolves what a build ships with, which in Release is nothing — see [Where the BFM base URL comes from](../../README.md#where-the-bfm-base-url-comes-from). Nothing constructs a `BFMHTTPClient` from it yet: the composition root binds implementations to `AppCore` protocols, and this package declares none, because the contract exposes no operation a feature needs.

## Running the tests

```bash
swift test --package-path Packages/BFMClient
```
