# ADR-039: Pillar Isolation

## Status

Proposed — 2026-07-06. Deciders: platform owner.

## Context

ADR-026 declared per-domain isolation at the _logical_ level: each pillar owns its own SQLite file, its own contract, and cross-pillar SQL/joins are forbidden. A 61-item coupling audit (2026-07-05) shows the _physical / operational_ substrate is still shared and contradicts that promise:

- One `pops-sqlite-data` Docker volume is mounted into all 9 SQLite pillars **and** read-only into metabase — the isolation Docker actually enforces (the volume) has 10+ consumers.
- One `pops-redis` (256mb, `allkeys-lru`) backs both food and cerebrum queues; one pillar's growth can evict the other's in-flight jobs.
- The per-pillar `infra/litestream/<id>.yml` files are **reference stubs only** — no sidecar runs. Real backup lives in the diverged (pre-rename) `homelab-infra` repo whose central `backup.sh.j2` VACUUMs a **nonexistent `pops.db`** and aborts before backing up anything, and whose restore would wipe every pillar's live file.
- That same central script mixes pops data with non-pops homelab infra (home-assistant, mosquitto, zigbee2mqtt, matter) in one archive/timer/bucket/retention budget.
- paperless-ngx is owned by nobody: its client is embedded in inventory, inventory isn't on paperless's network, and its env is unwired — the feature silently 412s in prod.
- Secrets, internal-auth tokens, image tags, ingress, and CI all enumerate every pillar centrally, forcing fleet-wide lockstep.

Logical isolation without operational isolation means one bad volume op, one Redis eviction, or one restore-in-place mistake blasts the whole federation simultaneously. This ADR closes that gap and records the owner's decisions on the four forks the audit surfaced.

## Decision

Adopt **operational pillar isolation** as a first-class invariant set, extending ADR-026 from the logical layer down to storage, backup, service ownership, and the pops-vs-infra boundary.

### Invariant 1 — Per-pillar storage

Every data pillar owns exactly one named volume `pops-<id>-data`, mounted only into its own container(s) at `/data/sqlite`. No volume is mounted into more than one pillar; no container mounts a volume it does not own (metabase's shared `sqlite-data:ro` mount is removed). Non-DB per-pillar trees (`FOOD_INGEST_DIR`, `MEDIA_IMAGES_DIR`, cerebrum engrams) each get their own declared volume in the owning pillar.

### Invariant 2 — Per-pillar backup, no central enumeration

Backup is a per-pillar responsibility. SQLite pillars run their **own Litestream sidecar** from `infra/litestream/<id>.yml` against their own isolated volume, replicating to their own bucket/prefix. A non-SQLite pillar **brings its own mechanism** (documents/paperless; cerebrum engrams via rclone+age). The platform layer never enumerates pillar stores in one script. Regeneratable trees (`MEDIA_IMAGES_DIR`, `FOOD_INGEST_DIR`) are explicitly excluded from replication; non-regeneratable non-SQLite state (engrams) is explicitly covered. A pillar's backup is not "done" until a per-pillar restore drill has been exercised.

### Invariant 3 — Single-owner services (no orphans)

Every running service has exactly one owning pillar **or** is explicitly classified platform-infra with a written rationale. paperless-ngx + paperless-redis → a new **documents** bridge pillar (ADR-035). engrams → cerebrum. External-service secrets live only in the owning pillar (Up→finance, TMDB/TheTVDB→media); dead secrets (notion) are deleted, not left dangling. Internal-auth credentials are registry-minted per-caller, not one shared token. No dependency a pillar inserts is left orphaned.

### Invariant 4 — pops-vs-infra boundary

home-assistant, mosquitto, zigbee2mqtt, matter are **homelab infrastructure, not pops**. They never enter pops's compose, backup scope, or Litestream convention; the homelab's own infra concern backs them up. The pops backup and the homelab-infra backup are **separate** scripts, timers, retention budgets, and buckets. metabase is classified **pops** (it dashboards pops's own domain data) as a platform-level _reporting_ concern — not a domain pillar; watchtower is pops platform-ops tooling.

### Invariant 5 — No central pillar enumeration on the runtime / deploy path

Registry unavailability never blocks a pillar's HTTP serving or container startup (listen-before-register, background-retry registration, `depends_on: service_started`). Routing (mcp), ingress (shell nginx), image tags/Watchtower, CI gates, and the toolchain pin must not impose fleet-wide lockstep where per-pillar independence is feasible.

## Decisions on the open forks (owner, 2026-07-06)

1. **Documents pillar — build the full bridge pillar now.** paperless is orphaned, network-unreachable, and 412s in prod today. Rather than a tactical env wire-up that entrenches the wrong ownership, create `pillars/documents` (ADR-035 bridge kind) owning paperless + paperless-redis, its own network/volumes/secrets/backup, with inventory consuming it over the SDK.
2. **Metabase — per-pillar read-only mounts.** Metabase stays a pops platform reporting concern with explicit read-only mounts of each pillar's own volume: every `pops-<pillar>-data` volume is mounted read-only into metabase at `/pillars/<pillar>` — the whole volume, so the pillar writer's live `-wal`/`-shm` keep WAL reads consistent — and each metabase datasource reads that pillar's own SQLite file inside the mount (`/pillars/<pillar>/<id>.db`, where `<id>.db` is the pillar's live database file — e.g. the registry pillar's is `registry.db` post-rename, not the retired `core.db`). No volume is shared between two pillars, and metabase only reads. Metabase's own H2 config (`metabase.db`) rides the pops backup. This is a **documented direct-SQL BI exception** to "no cross-pillar SQL" — explicitly not an approved general pattern; new dashboards should still prefer per-pillar reporting contracts where practical.
3. **Infra source-of-truth — pops7 is authoritative; reconcile first.** `infra/docker-compose.yml` + `infra/litestream/` in this repo are the authoritative topology (own sidecars, own backup). The diverged pre-rename `homelab-infra` must be reconciled with live post-rename capivara **before any prod-gated step** — this is the program's top blocker.
4. **Redis — split per-pillar.** food and cerebrum each get their own Redis instance/volume, removing the shared-eviction cross-pillar failure mode, consistent with the isolation mandate.

## Consequences

- **Positive:** the blast radius of a storage/backup/Redis fault collapses to one pillar; a restore drill restores one pillar's bytes without touching siblings; the diverged central backup stops being the single point of DR failure; paperless gets an owner and stops silently failing; pops-vs-infra becomes auditable; per-pillar release/canary/rollback becomes possible.
- **Costs / tradeoffs:** more volumes, more sidecars, more Redis containers, more secret files; an **irreversible-in-place** prod data migration (copy live `.db` files) that is therefore gated on _working_ backups; the diverged pre-rename `homelab-infra` must be reconciled with live capivara before any prod-gated step.

## Rollout / gating

Safe repo-level fixes land first (runtime SPOF, mcp routing, CI scoping, this ADR + status corrections to ADR-026 / `database-operations.md`, per-pillar Litestream/sidecar authoring, the documents-pillar scaffold). **Working per-pillar backups + a restore drill are the hard gate** for the prod volume split. Reconciling `homelab-infra` is a precondition for every prod-gated step. Documents-pillar cut-over, Redis split, and secrets isolation follow. The HA/MQTT guardrail (Invariant 4) applies from day one to any future ha-bridge pillar.

Execution is tracked in the pillar-isolation program epic and its workstream issues.

## Related

ADR-026, ADR-035, ADR-034, ADR-032, ADR-016.
