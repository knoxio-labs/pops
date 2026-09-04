# ADR-050: Finance logo assets live in a `logo_blobs` table in finance's own SQLite

## Status

Accepted

## Context

POPS-2804 adds logo upload for institutions (`institutions.logo_asset_id`,
already added by POPS-2803, has had nothing to resolve to). Finance has no
blob store of any kind today. Wherever the bytes land has to survive the
fresh-volume smoke gate (`scripts/ci/smoke-image.mjs`, which boots every
pillar image on a brand-new named volume and probes `/health`) and needs a
backup story, since this data cannot be reconstructed once lost.

## Options Considered

| Option                                     | Pros                                                                                                                                                               | Cons                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| (a) `logo_blobs` table in `finance.db`     | Rides litestream's existing whole-file replication of `finance.db` for free; no Dockerfile/compose/volume changes; migration alone satisfies the fresh-volume gate | SQLite is not built for large blobs — fine at logo scale (2 MiB cap), would not be at photo scale                                                                                                                                                                                                                       |
| (b) Shared asset service                   | Reusable across pillars (purchases receipts, food hero images, this)                                                                                               | Does not exist; building one is a project of its own, far outside this ticket's scope, and neither purchases (POPS-1924) nor food's hero-image module use one today — no precedent to build against                                                                                                                     |
| (c) Filesystem on the pillar's data volume | Matches food's hero-image / inventory's photos precedent; no SQLite blob-size ceiling                                                                              | Needs a NEW named volume + Dockerfile `mkdir`/`chown` line; **no backup mechanism** — litestream only replicates SQLite files, and the only filesystem-blob backup in this repo (`infra/backup/cerebrum-engrams.yml`) is a bespoke one-off, not a generic pattern. Losing the volume loses every logo with no way back. |

## Decision

(a). A `logo_blobs` table (`pillars/finance/migrations/0090_logo_blobs.sql`)
inside `finance.db`, storing raw bytes + `content_type` + `byte_length`. It
needs zero new infrastructure: no volume, no Dockerfile change, no compose
change, no CI gate change — the existing `sqlite-data` volume and
`infra/litestream/finance.yml` (which replicates the whole file at
`/data/sqlite/finance.db`) cover it exactly as they already cover every
other finance table. A row is never updated in place; a replacement upload
inserts a new row and repoints `institutions.logo_asset_id`, which makes the
serving URL content-addressed and therefore cacheable forever.

Option (c) was the closest runner-up — it is what food and inventory already
do — but only because those pillars accepted "no backup for this data" as a
standing gap. Institution logos are worth backing up (small number of
uploads, annoying but not catastrophic to lose, yet free to protect by
picking (a)), so there is no reason to import that gap here when (a) avoids
it entirely.

## Consequences

- No new pillar-image volume, Dockerfile change, or compose entry for
  finance — the migration is the entire infra footprint.
- Logo bytes are backed up automatically by finance's existing litestream
  replica, with no separate configuration.
- A future asset that is meaningfully larger than a logo (receipts,
  full-resolution photos) should NOT default to this pattern without
  re-litigating it — SQLite blob storage degrades at that scale, which is
  part of why POPS-1924 (purchases receipt blobs) and food's hero-image
  filesystem approach were left alone rather than retrofitted here.
- SVG is refused rather than sanitised (see `src/api/modules/logo-upload.ts`
  and the PR description for POPS-2804) — this repo has no SVG sanitiser
  dependency yet, and adding one is a separate, security-sensitive decision
  tracked as a follow-up ticket rather than guessed at in this change.
