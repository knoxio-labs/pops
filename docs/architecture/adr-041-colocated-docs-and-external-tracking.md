# ADR-041: Colocated documentation and external work tracking

## Status

Accepted — 2026-08-01. Supersedes [ADR-025](../../pillars/food/docs/architecture/adr-025-theme-07-food-doc-protocol.md), which recorded a deviation within a doc model that no longer exists.

## Context

POPS carried 448 markdown files totalling 3.2 MB: roughly 188 PRDs, 162 "ideas" files, 39 ADRs, three themes, a roadmap, and a documentation standard mandating that completing any work be recorded in **four** places — an inline acceptance-criteria checkbox, the PRD's own status, the theme's PRD index, and `docs/roadmap.md` — with a GitHub issue filed for every implementation gap on top.

The PRD model earned its place while the platform was being stood up. It stopped paying for itself once the platform was live. Three failures compounded:

- **Requirements became changelogs.** Most PRDs had drifted to `Status: Partial — X ships, Y and Z deferred to ../ideas/…`. A requirement that records what was _not_ built is a status report wearing a spec's clothes.
- **The four-place sync guaranteed drift.** Every place was a chance to forget, and status became untrustworthy precisely because keeping it true was expensive.
- **Documentation lived far from the code it described.** Understanding a module meant finding its PRD, which meant knowing the theme taxonomy, which meant the docs tree was a prerequisite for reading the source.

Verification during migration confirmed the drift was not hypothetical: the single best-maintained PRD in the repo made four claims the code contradicted, including describing a per-row AI call that had been batched and omitting a circuit breaker entirely.

Separately, GitHub Issues had been abandoned as a tracker — 35 open, 500+ closed, an elaborate label taxonomy nobody maintained, and no way to express the structure the work actually had.

## Options Considered

| Option                                                              | Pros                                                                                                                                                            | Cons                                                                                                                                       |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Keep the PRD regime, enforce harder                                 | No migration cost; traceability is explicit and auditable                                                                                                       | The enforcement _is_ the cost. Stricter gates on an already-abandoned process produce ceremony, not accuracy                               |
| Colocated READMEs + ADRs + inline comments, work tracked externally | Docs sit beside the code, so they are found without a taxonomy and rot visibly; the tracker holds only undone work, which is the only thing that needs a status | No single document describes a whole feature's requirements; traceability from a shipped behaviour back to its original ask is lost        |
| Move the docs into a wiki or Notion                                 | Rich editing, no repo noise                                                                                                                                     | Worse than PRDs — documentation gets further from code, and nothing forces an update when behaviour changes                                |
| Generate docs from code and tests                                   | Cannot drift by construction                                                                                                                                    | Captures shape, not intent; the cross-file orderings and invariants that are hardest to recover are exactly what generation cannot express |

## Decision

Documentation answers three questions, and each has exactly one home:

- **WHICH** — an ADR, for a decision with genuine alternatives. Numbering stays frozen and append-only.
- **HOW** — a `README.md` colocated in the directory it describes.
- **WHY** — an inline comment on the line whose reason is invisible from the code.

The code and its tests are the specification. Work that is not done lives in Huly (project `POPS`), scoped by Component to a pillar or a cross-cutting concern; GitHub Issues is disabled to prevent a split brain. PRDs remain a legitimate tool for standing up something genuinely new — a new pillar, a new subsystem — and are deleted as it ships.

READMEs carry **no coverage quota**. One is warranted only where the code cannot speak for itself: the feature narrative, orderings and invariants that span files, and absences that would otherwise mislead. Restating a file-header docstring is a defect, not thoroughness.

## Consequences

- A reader understands a module from the module, without knowing the docs tree exists. The taxonomy stops being a prerequisite.
- Drift becomes visible and local. A README that contradicts the file beside it is obvious in review, where a PRD three directories away was not.
- Status stops being maintained in the repo at all, so it stops being wrong there. The tracker is the only place that claims to know what is unfinished.
- **Accepted trade-off:** there is no longer a single document stating everything a feature must do. Recovering "why was this required" for shipped behaviour means reading git history rather than a spec. This is judged the right trade for a system with one operator, where the cost of maintaining that record exceeded its value.
- **Accepted trade-off:** the no-quota rule means coverage is a judgment call, and judgment varies. A missing README is preferred to a written-to-satisfy-a-gate one, because the latter is drift surface that reads as authoritative.
- The enforcement burden moves from authoring to honesty: a behaviour change must update the README beside it in the same commit, or delete the paragraph that is no longer true.
