# Runbook: Take One Pillar Live

> Audience: whoever is putting real data into a pillar for the first time, and whoever is on the other end of a migration that went wrong.
> Frequency: once per pillar, plus the recovery half whenever a deploy goes sideways.
> Related: [`infra/README.md`](../../infra/README.md) (compose + Litestream wiring), [`docs/runbooks/cut-release.md`](cut-release.md) (how images reach the host).

Everything here is **per pillar**. There is no fleet-wide database step, no shared `pops.db`, and no global init or seed: each pillar owns one SQLite file, creates and migrates it itself on boot, and streams it through its own Litestream sidecar. Running this for `finance` says nothing about `media`.

## The lifecycle you are stepping into

A pillar container starts, its opener (`pillars/<id>/src/db/open-<id>-db.ts`) creates the parent directory, opens the file, turns on WAL and foreign keys, and applies its own journal from `pillars/<id>/migrations/`. That apply runs behind a snapshot:

| Situation at boot                                     | What the opener does                                                      |
| ----------------------------------------------------- | ------------------------------------------------------------------------- |
| Volume's first ever mount — empty file, whole journal | Migrates directly. Nothing exists to snapshot.                            |
| Restart, journal fully applied                        | Migrates nothing, writes nothing.                                         |
| Pending entries against a database with tables        | `VACUUM INTO` a `<db>.pre-migration-<timestamp>.bak` first                |
| …and every entry applied                              | Deletes the snapshot, logs `All migrations applied. Backup removed.`      |
| …and one threw                                        | Leaves the snapshot, logs its path, and the boot fails with the SQL error |

The snapshot is deliberately not restored automatically — the process that failed still holds the handle, and writing over the live file from under it turns a diagnosable database into an undiagnosable one. Restoring is step 7 below, and it is a file copy.

## 1. Prerequisites

- **The pillar's Litestream sidecar replicates the volume its API actually writes to.** `infra/litestream/<id>.yml` existing is not enough: `check-litestream-sidecar-parity.mjs` matches ids only. Read [`infra/README.md`](../../infra/README.md) for which pillars are wired and which configs are still reference-only, and POPS-3 for the split that finishes it.
- **A restore drill you have personally seen work.** The per-pillar drill in each `infra/litestream/<id>.yml` header has not been exercised (POPS-256). Until it has, treat Litestream as untested and the pre-migration snapshot as your only proven local restore point.
- **The migration chain applies to a database that already holds rows.** Not just to an empty one — see step 6. `pnpm --filter @pops/<id> test` covers this where a data-safety test exists (`pillars/finance/src/db/__tests__/migration-data-safety.test.ts`, `pillars/purchases/src/db/__tests__/migration-data-safety.test.ts`).
- **Secrets and env on the host.** Per [`infra/README.md`](../../infra/README.md): the pillar's `<ID>_SQLITE_PATH`, its service-account key, and any provider credentials. The image ships a default `SQLITE_PATH` so it boots with no environment at all — that default is the fallback, not the plan.

## 2. First boot

```bash
docker compose -f infra/docker-compose.yml up -d <id>-api
docker compose -f infra/docker-compose.yml logs -f <id>-api
```

You are looking for the pillar to create its file, apply its whole journal without a snapshot (there is nothing to snapshot yet), answer `/health`, and register with `registry`. If it dies on `SQLITE_CANTOPEN`, the data directory arrived root-owned — that is the fresh-volume contract, and the fix is in the image, not the host (`pillars/<id>/Dockerfile`).

## 3. Initial import

Import through the pillar's own write path, never by writing SQL into the file. The write path validates, dedups and stamps provenance; a direct INSERT skips all three and the pillar cannot tell afterwards.

- **finance** — CSV import through the finance app in the shell.
- **purchases** — `pillars/purchases/scripts/ingest-amazon.ts` and `pillars/purchases/scripts/ingest-woolworths.ts`, both of which POST through `/purchases` and need `POPS_INTERNAL_API_KEY` set to an account granted `purchases.source` and `purchases.purchase`.
- **food** — `db:seed:food` seeds fixtures, and is a development command. It is not an import path, and step 5 applies to it from the moment real recipes exist.
- **everything else** — starts empty and fills through its API.

Import one source at a time and verify between sources. A second import against a broken first one is two problems.

## 4. Verification

```bash
# row counts, per pillar, read-only
docker compose -f infra/docker-compose.yml exec <id>-api \
  node --input-type=commonjs -e "const D=require('better-sqlite3');const d=new D(process.env.SQLITE_PATH,{readonly:true});
  for (const t of d.prepare(\"SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'\").all())
    console.log(t.name, d.prepare('SELECT count(*) AS n FROM \"'+t.name+'\"').get().n);"
```

Then spot-check through the API, not the file: fetch a handful of records the import created and compare them against the source document. A row count proves the rows arrived; only a spot check proves they arrived intact.

## 5. Point of no return

The moment a pillar holds data you cannot re-derive, **no destructive script runs against it again** — not with `FORCE=true`, not "just to reset the fixtures". `FORCE=true` exists for a development database whose contents you are willing to lose, and it prints the row counts it is about to destroy precisely so that sentence has to be true when you read it.

From here, the recovery paths are step 7, and both of them are restores.

## 6. Ongoing schema changes

1. Edit the pillar's drizzle schema under `pillars/<id>/src/db/`.
2. Produce the migration. Some pillars generate it with `drizzle-kit`; `purchases` hand-writes the SQL and holds it to the schema with a drift test instead ([`pillars/purchases/README.md`](../../pillars/purchases/README.md)). Either way the result is a `.sql` file plus a `meta/_journal.json` entry.
   - **The entry's `when` is load-bearing, not decorative.** A pillar applies an entry only when its `when` is strictly newer than the timestamp the database recorded — so two entries sharing a `when` mean the second never runs on any database that already took the first. Stamping it `previous + 1` is the convention, and it is exactly why two branches cut from the same base collide: both mint the same number, and git resolves that as ordinary conflicting text. **When you rebase or merge a branch that adds a migration, re-stamp yours and renumber its `idx` and tag** rather than accepting either side. `scripts/ci/check-migration-journals.mjs` rejects a duplicate `when` or `idx`, an entry with no `.sql` file, and a `.sql` file with no entry; run it locally after any journal merge.
3. Review the SQL as a data change, not a schema change. Ask what it does to rows that already exist: does an added NOT NULL column carry a default, does a rebuild list every column, does a backfill touch rows it should not.
4. Extend that pillar's data-safety test to cover it — seed rows before the entry, assert them after. This is the gate that would have caught it; a test that only ever migrates an empty database cannot.
5. Commit, deploy, and the pillar migrates itself on its next boot behind the snapshot described above.

## 7. Emergency recovery

**A migration failed at boot.** The container is down and the log ends with the SQL error and a line naming the snapshot:

```
[db] Backing up before applying 3 migration(s)...
[db] Migration failed. Backup preserved at /data/sqlite/<id>.db.pre-migration-2026-08-13T04-05-06-007Z.bak
```

```bash
docker compose -f infra/docker-compose.yml stop <id>-api          # it is already down; make sure
docker compose -f infra/docker-compose.yml run --rm --entrypoint sh <id>-api -c \
  'cp /data/sqlite/<id>.db.pre-migration-<timestamp>.bak /data/sqlite/<id>.db && rm -f /data/sqlite/<id>.db-wal /data/sqlite/<id>.db-shm'
```

Then pin the image back to the tag that was running before (`POPS_IMAGE_TAG=sha-<short>` — see [`docs/runbooks/cut-release.md`](cut-release.md)) and start it. The database is now exactly as it was one moment before the failed migration, and the migration is a bug to fix on a branch with a test, not something to retry against production.

**The volume is gone or corrupt.** This is the Litestream path, per pillar:

```bash
docker compose -f infra/docker-compose.yml stop <id>-api <id>-litestream
litestream restore -o /data/sqlite/<id>.db "${<ID>_LITESTREAM_REPLICA_URL}"
docker compose -f infra/docker-compose.yml up -d <id>-api <id>-litestream
```

The API container must be stopped first — restoring under a live writer produces a file that is neither the backup nor the current state. The replica URL and credentials live in the deployer's own infra repo (`knoxio/homelab-infra`), not here, and this drill is still unexercised (POPS-256).

## Safe vs destructive, per pillar

| Command                                               | Safe?           | Notes                                                                                                 |
| ----------------------------------------------------- | --------------- | ----------------------------------------------------------------------------------------------------- |
| `docker compose … up -d <id>-api`                     | safe            | Applies pending migrations behind a snapshot                                                          |
| `docker compose … restart <id>-api`                   | safe            | No pending entries means no writes at all                                                             |
| `pnpm --filter @pops/<id> test`                       | safe            | Every pillar test runs against a temp or in-memory database                                           |
| `litestream restore -o …`                             | safe            | With the API stopped. Overwrites the file, which is the point                                         |
| `POPS_IMAGE_TAG=sha-… up -d`                          | safe            | Rolling back the image does NOT roll back an applied migration                                        |
| `pnpm --filter @pops/food db:seed:food`               | **destructive** | Wipes twenty-one tables. Refuses on production and on a populated database                            |
| `FORCE=true pnpm --filter @pops/food db:seed:food`    | **destructive** | The same wipe, with the populated-database refusal waived by hand                                     |
| `mise run db:clear:<id>`                              | **destructive** | Truncates that pillar, keeping schema and journal. Refuses on production and outside the working tree |
| Any `sqlite3 <id>.db` session that is not `-readonly` | **destructive** | Bypasses every validation the pillar's write path applies                                             |
| `docker volume rm pops-<id>-data`                     | **destructive** | The whole pillar, gone. Recovery is step 7's second half                                              |

`NODE_ENV=production` is refused by every guarded script and cannot be waived by anything, including `FORCE=true`. That is a deliberate asymmetry: an environment variable that could turn off the production refusal would be set by exactly the automation the refusal exists to stop.
