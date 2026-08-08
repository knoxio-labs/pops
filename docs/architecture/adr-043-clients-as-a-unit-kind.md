# ADR-043: `clients/` as a third repo unit kind

## Status

Accepted — 2026-08-08. Introduces `clients/` as a sibling of `pillars/` and `libs/` (POPS-1363).

## Context

The repo has had exactly two unit kinds since the federation reshuffle: `pillars/` — a service that serves a contract, owns or bridges a store, and self-registers with the registry — and `libs/` — importable shared code that must never import a pillar. That dichotomy is not just prose in `AGENTS.md`; it is compiled into the machinery:

- `.github/workflows/_discover-units.yml` scans `pillars/` and `libs/` at `maxdepth 1` and emits the matrix `unit-quality.yml` runs.
- `scripts/ci/check-docs-model.mjs` takes the same two roots as its unit list — every one needs a `README.md` — and takes them again, with `docs/`, `infra/`, `scripts/` and `.github/`, as the prefixes it will resolve a documented path against. A path under a root it does not know is not checked; it is invisible.
- `pnpm-workspace.yaml` matches `pillars/*`, `pillars/*/*` and `libs/*`. Anything else is outside the dependency graph.
- `.github/workflows/publish-images.yml` builds one image per `pillars/<id>/Dockerfile`.

A native Swift iPhone app (POPS-1368) is neither kind. It serves no contract, owns no store, exposes no manifest, and cannot be imported by anything in the workspace — it is not a JS package or a Cargo crate at all. It is a signed binary that leaves the repo through App Store Connect, runs on hardware outside the network, and reaches the federation over HTTP through exactly one pillar (the BFM, POPS-1364).

The apparently obvious home — `pillars/bfm/app/`, the per-pillar frontend convention — is unavailable rather than merely awkward. `pillars/*/*` is a pnpm workspace glob, so the directory would be installed as a workspace member; and `_discover-units.yml`'s `assert-app-coverage` job enumerates every `pillars/*/app` on disk and fails the build when one is not an `@pops/app-*` package routed to both covering frontend workflows. An `.xcodeproj` and a tree of `Package.swift` files would sit inside a Node package that CI asserts is a React app.

[ADR-035](adr-035-pillar-redefinition-and-implicit-kinds.md) anticipated this artefact and gave a different answer — "the iOS app, when it ships, becomes a UI pillar peer of the shell". That answer was about the runtime registry rather than the repo, and it does not survive contact with the thing itself. See the Decision.

## Options Considered

| Option                                              | Pros                                                                                                                                                                                                                                                                                | Cons                                                                                                                                                                                                                                                                                                                                                                                       |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pillars/bfm/app/` — treat it as the BFM's frontend | No taxonomy change, no guard edits; sits beside the only backend it talks to                                                                                                                                                                                                        | Structurally blocked, not merely ugly: `pillars/*/*` is a pnpm workspace glob and `assert-app-coverage` fails any `pillars/*/app` that is not an `@pops/app-*` npm package. The slot is also already spoken for — the BFM's real frontend is the operator-facing Devices page, `@pops/app-bfm` (POPS-1387) — so two unrelated surfaces would contend for one path                          |
| A separate repo, `knoxio-labs/pops-ios`             | True isolation; the iOS release cadence never touches this repo's CI; a Swift toolchain never enters a Node/Rust workspace                                                                                                                                                          | Puts the BFM contract across a repo boundary. Per [ADR-033](adr-033-cross-language-pillar-contracts.md) the OpenAPI snapshot _is_ the cross-language contract, so the app would vendor a copy of a spec it cannot watch change, and every lockstep change — a BFM endpoint plus the screen that calls it — becomes two PRs in two repos with no CI on either side able to fail on the skew |
| Revive `apps/`                                      | The name already reads as "end-user surface" to anyone arriving from another codebase                                                                                                                                                                                               | The name is burned. `AGENTS.md` records "No `apps/`, no `packages/`, no turbo" as an invariant of the monolith's removal; a directory called `apps/` reads as that monolith returning, and the first question every future reader asks is whether it did                                                                                                                                   |
| A bare top-level `ios/`, declaring no new kind      | Cheapest available — one directory, no ADR, no guard change beyond `.gitignore`                                                                                                                                                                                                     | The guards cannot see it. `check-docs-model.mjs` resolves paths only under roots it knows, so a README under `ios/` could name files that never existed and nothing would fail; unit discovery would not require it to carry a README at all. The taxonomy quietly becomes "two kinds, plus whatever is lying around", which is the state in which the next contributor invents a fourth   |
| **`clients/` as a third unit kind (chosen)**        | Names the category rather than the instance, so the membership rule can be written down and applied to the next candidate; the guards learn one new root and then treat it like any other; keeps the app in-repo, where a BFM change and the screen consuming it land in one commit | A third slot in a taxonomy whose appeal was having two, for a single inhabitant; the docs-model guard, `AGENTS.md` and `.gitignore` all need editing before the first inhabitant lands (POPS-1365)                                                                                                                                                                                         |

## Decision

**`clients/` is a third top-level unit kind.**

> A **client** is a distributable end-user binary that consumes the federation over HTTP and is never imported by anything in this repo.

Both halves decide membership, and neither alone is sufficient:

- **Consumes over HTTP.** A client talks to a pillar's published contract over the network, exactly as an external consumer would. It never imports a pillar's source, never shares a process with one, and never reaches into its directory. Its generated client comes from an OpenAPI snapshot, per ADR-033.
- **Never imported.** No unit in this repo may depend on a client. This is the `libs/` rule pointed the other way: a lib is defined by being importable and forbidden from importing a pillar; a client is defined by being unimportable.

A third property follows from the first two, and is the one that actually changes engineering decisions: a client is **distributed, not deployed**. It ships to devices the operator does not control and cannot roll forward. Every other consumer of a pillar contract in this repo is redeployed alongside it.

First and only inhabitant: `clients/ios` (POPS-1368).

Three things a client is not:

- **Not a pillar's `app/`.** `pillars/<id>/app` is a lazy-loaded feature of the shell SPA — in-process, imported by `@pops/shell`, released with it. It fails both halves of the definition.
- **Not a lib.** Importability is the whole of what a lib is.
- **Not a registered pillar — and this narrows ADR-035.** That ADR predicted the iOS app would register as a UI pillar peer of the shell. A UI pillar's manifest advertises a `baseUrl` consumers can reach; a binary on someone's phone has no such URL, and nothing in the fleet could usefully discover it. The iOS app registers nothing. Its presence in the federation is the `bfm` pillar (POPS-1364), which registers normally, and which exists precisely so that the phone never learns the federation's topology. ADR-035's categories are otherwise untouched — only its iOS example was wrong.

The kind is a **repo-layout** concept and stays one. It gets no column in `pillar_registry` and no field in any manifest, consistent with ADR-035's decision to keep kinds implicit and let the orchestrators iterate by capability.

## Consequences

- **One guard, one doc and `.gitignore` learn the new root (POPS-1365).** `check-docs-model.mjs` gains `clients/` in both `PATH_ROOTS` and its unit-discovery loop, with self-test assertions to match; `AGENTS.md`'s "exactly two unit kinds" becomes three, describing the shape rather than listing the inhabitants; `.gitignore` gains the Xcode and SPM artefacts a Swift tree produces.
- **Ordering matters, in the counter-intuitive direction.** Teaching the docs guard about `clients/` is what makes paths under it _checked_ — so adding the root before `clients/ios/README.md` exists fails the build on every document that names one. The guard change and the first client's README land together.
- **This ADR may name a path that does not yet exist; no other document may.** `check-docs-model.mjs` exempts `docs/architecture/adr-*` from path resolution as historical records: an ADR describes the tree as it stood when the decision was made. That exemption is exactly why the accuracy of the paths above rests on the author and not on CI.
- **`clients/` stays out of the pnpm workspace.** `pnpm-workspace.yaml` matches `pillars/*`, `pillars/*/*` and `libs/*`, so there is nothing to add and nothing to exclude — and nothing should be added. A Swift tree inside the JS dependency graph would be installed, linted and typechecked by tools with nothing to say about it.
- **Unit discovery ignores clients for free, which means a client has no CI until someone writes it one.** `_discover-units.yml` scans only `pillars/` and `libs/` and skips any directory carrying neither `package.json` nor `Cargo.toml`, so `clients/ios` never enters `unit-quality.yml`'s matrix. That is correct — no Node or Cargo lane could build it — and it is a trap, because absence from a matrix is indistinguishable from passing it. A client's coverage is its own workflow, wired into `ci-gate.yml` (POPS-1376).
- **A client publishes no image.** `publish-images.yml` is driven by `pillars/<id>/Dockerfile`. Distribution runs through App Store Connect, outside this repo's release machinery entirely, so "merged to `main`" and "on the operator's phone" stop being the same event.
- **The contract-compatibility burden differs in kind, not degree.** [ADR-040](adr-040-cross-pillar-contract-discipline.md)'s regenerate-and-diff gates prove that the _committed_ client matches today's contract — a guarantee that works only because every in-repo consumer redeploys with its producer. Neither that gate nor any other can say anything about the build already installed on a phone. Removing a field from a BFM response is therefore a breaking change against a consumer no CI job in this repo can see, which is why the BFM's contract has to be additive-first and use ADR-040's dual-accept deprecation window rather than relying on the diff gate.
- **"Never imported" is unenforced, and only accidentally safe.** Nothing enforces it today because a Swift package is structurally invisible to pnpm and cargo. The moment a client is written in a language the workspace speaks — an Electron app, a CLI — that invariant needs a guard of its own, the mirror of `scripts/ci/check-lib-no-pillar-import.mjs`.
- **A third slot invites stretching.** Membership requires both halves of the definition. Something served over HTTP and consumed by other units is a pillar; something importable is a lib; something that is neither and is also not distributable end-user software is a new decision, not an extension of this one.
- **Trade-off accepted:** more taxonomy for a single inhabitant. The alternative on offer was an unnamed directory the guards could not see, and the failure mode of that is not a missing README — it is a README full of paths nobody checks.

## Related

- [ADR-035](adr-035-pillar-redefinition-and-implicit-kinds.md) — pillar kinds; this ADR narrows its iOS-as-a-UI-pillar example and leaves the rest intact
- [ADR-041](adr-041-colocated-docs-and-external-tracking.md) — the documentation model whose guard gains the new root
- [ADR-033](adr-033-cross-language-pillar-contracts.md) — the OpenAPI snapshot as the cross-language contract, which is what makes a generated Swift client possible without a hand-written SDK
- [ADR-040](adr-040-cross-pillar-contract-discipline.md) — the regenerate-and-diff discipline the iOS BFM client follows (POPS-1380), and the deprecation window that has to cover what the diff cannot reach
