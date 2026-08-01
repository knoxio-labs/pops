# docs

Cross-cutting material only. Three things live here and nothing else:

|                                  |                                                                           |
| -------------------------------- | ------------------------------------------------------------------------- |
| [`vision.md`](vision.md)         | Why POPS exists and the principles behind it                              |
| [`architecture/`](architecture/) | ADRs — decisions with real alternatives, numbering frozen and append-only |
| [`runbooks/`](runbooks/)         | Operational procedures that belong to no single pillar                    |

## Where everything else is

**How a thing works** lives in a `README.md` beside the code, and a directory with no README is a correct outcome — one is written only where the code cannot speak for itself. Start at `pillars/<id>/README.md` or `libs/<name>/README.md` and follow it down; a file's own header comment usually answers the question before any README does.

**Why a line is the way it is** lives in a comment on that line.

**Work that is not done** lives in Huly, project `POPS` at [projects.knoxiolabs.com](https://projects.knoxiolabs.com), scoped by Component to a pillar or to a cross-cutting concern. GitHub Issues is disabled on this repo.

An ADR scoped to one pillar lives with that pillar, under `pillars/<id>/docs/architecture/`. The ones here are global.

## What is deliberately absent

There are no PRDs, themes, epics, user stories, acceptance criteria, status tables or roadmaps, and reintroducing any of them fails CI (`scripts/ci/check-docs-model.mjs`). The reasoning, and the trade-offs accepted, are in [ADR-041](architecture/adr-041-colocated-docs-and-external-tracking.md).
