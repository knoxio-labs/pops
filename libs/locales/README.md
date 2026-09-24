# @pops/locales

The frontend's shared translation catalogues. Data only — no code, no barrel, no build step. `package.json` exports `./*`, so consumers import a file by path: `import enAUUi from '@pops/locales/en-AU/ui.json'`.

Two locales, `en-AU` (default and fallback) and `pt-BR` — the `SUPPORTED_LOCALES` `@pops/pillar-sdk` declares — each holding one JSON file per namespace. Only the namespaces the shell and the kit read live here: `common`, `shell`, `navigation` and `ui`, plus `errors` (below). Keys are flat objects of dotted keys (`"dataTable.columns"`); nothing in the repo overrides i18next's default `.` key separator, so a nested object would be reached with the same dotted lookup string.

## Pillar namespaces are not here

Each pillar app owns its namespace in `pillars/<pillar>/app/src/locales/{en-AU,pt-BR}.json`, exports it from its remote entry as `i18n`, and the shell's runtime loader registers it with the shell's i18next instance when that pillar's bundle first loads (`pillars/shell/src/app/remote-translations.ts`). The app's own `src/locales/locales.test.ts` checks its locale parity.

## Consumers

- `pillars/shell/src/i18n/index.ts` — the shell's i18next initialisation. It imports the four shared namespaces statically and registers them at init.
- `libs/ui` — `src/test-setup.ts` bootstraps `ui` so component tests render copy instead of keys.
- `pillars/inventory/app` — its test setup and two upload tests read `ui`.
- `pillars/design/src/i18n.ts` — the playground registers `common` and `ui`.
- `pillars/cerebrum/src/api/__tests__/retrieval.test.ts` — reads `errors` in both locales.

## A file here is not live until the shell registers it

Adding `<locale>/<namespace>.json` does nothing by itself. The shell's i18n module must import it, list the namespace in `NAMESPACES`, and add it under `resources`. `errors.json` is the standing example: keys mirroring backend error codes, registered with no i18next instance.

Forgetting that registration fails `pillars/shell/src/i18n/index.test.ts`, which compares the files on disk against `NAMESPACES` and against the `resources` map for both locales. `errors` is named in that test's allowlist of deliberately-unregistered catalogues; nothing else is.

## Parity is guarded, dead keys are not

Nothing generates `pt-BR` from `en-AU`, and no build step fails on a missing translation. `pillars/shell/src/i18n/index.test.ts` discovers every file in this directory from disk via `import.meta.glob`, registered or not, and runs each through `localeCatalogueProblems` from `@pops/pillar-sdk/testing` — the same check each pillar app runs over its own catalogues. A namespace whose `en-AU`/`pt-BR` pair is out of step, holds an empty value, or holds a number, boolean or `null` leaf fails that test instead of surfacing at runtime as English text inside a Portuguese UI via the `en-AU` fallback.

There is no dead-key detection. Several `ui.json` entries name components that hardcode their English strings instead of calling `t()`.
