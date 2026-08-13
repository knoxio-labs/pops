# Runbook: Cut a Pops Release

> Audience: anyone with `write` access to `knoxio-labs/pops`.
> Frequency: only when you want to pin a stable point — day-to-day deploys need no release (see below).
> Related: [`infra/README.md`](../../infra/README.md) — the compose deploy contract.

## TL;DR

You almost never need this runbook — nothing here is a manual step. Pushing to `main` ships the whole fleet and cuts the version:

1. A push to `main` triggers [`publish-images.yml`](../../.github/workflows/publish-images.yml), which rebuilds and pushes **one image per pillar** plus the non-pillar app images.
2. Each image is tagged `main` and `sha-<short>`.
3. Watchtower on the deployer (60s poll, label-scoped) sees the new `main` digest and rolls the live containers forward.
4. The same push triggers [`release.yml`](../../.github/workflows/release.yml), which cuts `vX.Y.Z` **if and only if** the commits since the last tag warrant one — a `chore`/`docs`/`refactor`-only push produces no tag.

The semver tags exist so a deployer can **pin** to a stable point instead of tracking `main`. Read on when you need to understand what the bump will be, or to cut a tag by hand.

The full changelog history lives in [GitHub Releases](https://github.com/knoxio-labs/pops/releases) — there's no in-repo `CHANGELOG.md`. The repo ruleset forbids direct pushes to `main`, so the release flow is tag-only by design.

## What gets published

`publish-images.yml` builds two sets of images, each tagged `main` (on the default branch), `sha-<short>`, and the six semver variants on a `v*` tag:

| Set     | Images                                                                                                                                                  | Built from                      | How it's selected                                                                                                                                                                                                                   |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pillars | `ghcr.io/knoxio-labs/pops-<id>` for every served pillar (`registry`, `inventory`, `media`, `finance`, `food`, `lists`, `cerebrum`, `ai`, `contacts`, …) | `pillars/<id>/Dockerfile`       | **Discovered**: the workflow greps `infra/docker-compose.yml` for `image: ghcr.io/knoxio/pops-<x>:` refs that have a matching `pillars/<x>/Dockerfile`. Adding a pillar image to the prod compose enrolls it with no workflow edit. |
| Apps    | `pops-shell`, `pops-mcp`, `pops-orchestrator`, `pops-docs`                                                                                              | their `pillars/<id>/Dockerfile` | **Static matrix** in the workflow. These pin an `image:` ref but are listed explicitly rather than discovered.                                                                                                                      |

One pillar image can back more than one service: the food worker (`pops-worker-food`) and the cerebrum worker (`cerebrum-worker`) reuse `pops-food` / `pops-cerebrum` with a runtime command override, so they need no separate publish.

> There is no `pops-api` and no single `pops-worker` image. The old monolithic two-image `pops-{api,shell}` model is gone — each pillar is its own image now.

## What a release is for

A release is a fixed, reproducible point a deployer can pin to. The commit type decides whether one is cut and how big the bump is, so the commit message is the only lever — there is no "decide to cut a release" step. Say `feat`/`fix` when **the compose contract changed** in a way a deployer can observe:

- service names (e.g. `registry-api`, `pops-worker-food`, `cerebrum-worker`)
- network names (`pops-frontend`, `pops-backend`, `pops-documents`)
- volume names (`pops-sqlite-data`, `pops-redis-data`, `pops-paperless-*`, `pops-metabase-data`, …)
- secret names (any file under `secrets/`)
- env vars consumed by compose (`POPS_IMAGE_TAG`, `POPS_REGISTRY_URL`, `POPS_DOMAIN`, …)
- the image names or registries themselves

Internal app refactors that don't change the compose contract don't need a release — `main` and `sha-*` tags are enough for anyone tracking head — but a `fix:` on pillar internals still cuts a patch, which is intended: the tag is cheap and it pins the whole fleet at a known-good point.

## Versioning scheme

Semver on git tag: `vMAJOR.MINOR.PATCH`. A single product version covers the whole fleet — every image ships together.

| Bump  | Trigger                                                                                             |
| ----- | --------------------------------------------------------------------------------------------------- |
| MAJOR | Breaking compose-contract change (renamed service, removed network, mandatory new env var)          |
| MINOR | Backwards-compatible additions (new optional env var, new container, new secret with empty default) |
| PATCH | Bug fixes, doc-only changes, internal app changes published in lockstep                             |

Pre-1.0, [`release.sh`](../../.github/scripts/release.sh) collapses `major` bumps into `minor` (breaking changes don't auto-promote to `v1.0.0`). Once `v1.0.0` is tagged, MAJOR is reserved for breakage.

## Conventional Commits cheat sheet

[`release.sh`](../../.github/scripts/release.sh) reads commit subjects on `main` since the last strict `vX.Y.Z` tag to compute the next version and the grouped release notes.

| Commit prefix                               | Bump                    | Goes in release-notes section |
| ------------------------------------------- | ----------------------- | ----------------------------- |
| `feat: …`                                   | minor                   | Features                      |
| `fix: …`                                    | patch                   | Bug Fixes                     |
| `perf: …`                                   | patch                   | Performance                   |
| `feat!: …` / `BREAKING CHANGE:` footer      | major (→ minor pre-1.0) | Features                      |
| `docs: …`                                   | none                    | Documentation                 |
| `ci: …` / `build: …`                        | none                    | CI/CD / Build                 |
| `revert: …`                                 | none                    | Reverts                       |
| `chore:` / `refactor:` / `test:` / `style:` | none                    | Hidden                        |

`docs`, `ci`, `build`, `revert` show up in the notes but never drive a bump on their own — they only appear if at least one `feat` / `fix` / `perf` / breaking commit triggers a release.

## How a versioned release happens

```text
push to main (Conventional Commits)
        │
        ├─▶ publish-images.yml: rebuild + push the full fleet as
        │   ghcr.io/knoxio-labs/pops-<id>:main and :sha-<short>
        │   → Watchtower rolls live `main` deployers forward
        │
        └─▶ release.yml (also every push; workflow_dispatch stays for
              cutting one out of band):
              release.sh reads commits since the last vX.Y.Z tag,
              computes the bump, writes release-notes.md
                    │  (nothing releasable → exits, no tag)
                    ▼
              packs moltbot-bundle-vX.Y.Z.tar.gz
                    │
                    ▼
              tags vX.Y.Z at HEAD + pushes it + gh release create
              with the moltbot bundle attached
                    │
                    ▼
              dispatches publish-images.yml AT THE NEW TAG, which
              re-tags every fleet image with the semver set:
                vX.Y.Z, X.Y.Z, vX.Y, X.Y, vX, X
```

> **Why an explicit dispatch rather than the tag push.** GitHub does not start a workflow run from an event created with `GITHUB_TOKEN`, and `workflow_dispatch` is one of only two exceptions to that. The `v*` tag `release.yml` pushes therefore never reached `publish-images.yml` on its own — across ~440 semver tags, GHCR carries `main` and `sha-*` tags and no semver ones at all, so `POPS_IMAGE_TAG=vX.Y.Z` had nothing to resolve to. The dispatch step is what closes that, and it is why the workflow needs `permissions: actions: write`.

## Release assets

Every release carries `moltbot-bundle-vX.Y.Z.tar.gz` alongside the images. The `moltbot` compose profile is served from bind-mounted files rather than from an image, and the bundle is how a deployer gets those files without a source checkout — see [`pillars/moltbot/README.md`](../../pillars/moltbot/README.md). It is built by `scripts/pack-moltbot-bundle.mjs`, which `release.yml` runs before `gh release create`.

## Manual escape hatch

If `release.yml` is broken or computes the wrong bump, cut the tag by hand from `main`:

```bash
git checkout main
git pull
git tag -a v0.1.0 -m "Release v0.1.0"
git push origin v0.1.0
```

Then write release notes in the GitHub Release UI. `publish-images.yml` runs on any `v*` tag push regardless of who created it.

## Pinning a release as a deployer

```bash
echo 'POPS_IMAGE_TAG=v0.1.0' >> .env
docker compose -f infra/docker-compose.yml pull
docker compose -f infra/docker-compose.yml up -d
```

Watchtower will not roll forward while the resolved digest is fixed to that tag. To resume tracking `main`:

```bash
sed -i '' 's/^POPS_IMAGE_TAG=.*/POPS_IMAGE_TAG=main/' .env
docker compose -f infra/docker-compose.yml pull
docker compose -f infra/docker-compose.yml up -d
```

`POPS_IMAGE_TAG` defaults to `main` everywhere in the prod compose, so an unset value tracks head.
