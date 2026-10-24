# Generated API clients

Each pillar commits its OpenAPI snapshot (`pillars/<id>/openapi/<id>.openapi.json`)
and every vendored copy of one. Those snapshots are the contract that gets
reviewed and checked for drift. The code derived from them is not committed:

- the Hey API clients under `pillars/*/app/src/*-api/`,
  `pillars/shell/src/registry-api/` and `libs/overlay-ego/src/ego-api/`;
- each pillar's `src/contract/api-types.generated.ts`.

`generate.mjs` produces them. It runs from these places:

| Where                       | Why                                                      |
| --------------------------- | -------------------------------------------------------- |
| root `postinstall`          | fresh clones and every CI job that installs              |
| root `build` / `mise build` | `mise check`, `mise test` and `mise dev` all build first |
| `mise lint` / `pnpm lint`   | type-aware lint resolves the client types                |
| UI image Dockerfiles        | their filtered install does not have this script yet     |
| a pillar's own `build`      | `generate:api-types` runs before `tsc`                   |

After a contract change, `mise build` regenerates every client from the new
snapshot. Run `node scripts/codegen/generate.mjs --force` to regenerate even
when the stamp in `tmp/codegen/` says the clients are current.

## Discovery

A target is a `generate:*` script with a step that runs `openapi-ts`. Its
output is that step's `-o <dir>`. A pillar's `generate:api-types` is also a
target, and its output comes from `exports['./api-types'].types`. The set is
pinned in `EXPECTED_TARGETS`. Each run also checks that every output is listed
in `.gitignore` and that none is tracked. A new client therefore needs its
script, its `EXPECTED_TARGETS` entry and its `.gitignore` line in the same
change.

## What stays committed

- **OpenAPI snapshots**: they are the contract.
- **`manifest.generated.ts`**: the manifest's contract type, compiled into the
  pillar and drift-checked by each pillar's `verify-manifest.ts`.
- **`libs/module-registry/src/generated.ts`**: checked by
  `registry-generated-quality.yml`.
- **The iOS client**: `clients/ios/Contracts/bfm.openapi.json` and the Swift
  under `Packages/BFMClient/Sources/BFMClient/Generated`. The generator is a
  separate SwiftPM tool that no app package resolves. Making Xcode run it would
  put a cold build of that tool in front of every app, test and TestFlight
  build, and Xcode opened directly would have no client at all. See
  `clients/ios/Packages/BFMClient/README.md`.

None of these has a merge driver that regenerates it. Git runs a merge driver
per file, before the merged sources reach the work tree, so at that point there
is no merged contract to regenerate from. They take the ordinary merge, which
is mergiraf for the JSON and TypeScript files
(`scripts/git/README.md`).
