# @pops/locales

Translation catalogues for the POPS frontend. Data only — no code, no barrel, no build step. `package.json` exports `./*`, so consumers import a file by path: `import enAUUi from '@pops/locales/en-AU/ui.json'`.

Two locales, `en-AU` (default and fallback) and `pt-BR`, each holding one JSON file per namespace. Key shape is not uniform: most namespaces are flat objects of dotted keys (`"recipes.list.empty.title"`), while `lists.json` nests two objects, `detail` and `shopping`. Nothing in the repo overrides i18next's default `.` key separator, so both shapes are reached with the same dotted lookup string.

## Consumers

- `pillars/shell/src/i18n/index.ts` — the only i18next initialisation in the application. It imports every bundle statically and registers the namespace list; nothing here is lazily loaded.
- `src/test-setup.ts` in `libs/ui` and in every pillar app (`ai`, `cerebrum`, `finance`, `food`, `inventory`, `lists`, `media`) — bootstraps the namespace so component tests render copy instead of keys.
- Tests and stories that assert against real copy, beyond those test-setup files: 35 in `pillars/food/app`, 7 in `pillars/lists/app`, and `pillars/finance/app/src/pages/transactions/columns.test.ts` — the only file outside the shell that imports a `pt-BR` bundle.

Pillar frontends do not import these files in application code — they call `useTranslation('<namespace>')` and get whatever the shell registered. Every pillar app still declares the dependency, which is what lets a test or story reach for the real copy.

## A file here is not live until the shell registers it

Adding `<locale>/<namespace>.json` does nothing by itself. The shell's i18n module must import it, list the namespace in `ns[]`, and add it under `resources`. `errors.json` is the standing example: 47 keys in both locales, mirroring backend error codes, registered nowhere and imported by nothing.

## Parity and dead keys are unguarded

Nothing generates `pt-BR` from `en-AU`, and no build step fails on a missing translation. The only check is a test in `pillars/shell/src/i18n/index.test.ts` that compares key sets between the two locales — and it covers nine namespaces, not `food`, `lists` or `errors`. A gap surfaces at runtime as English text inside a Portuguese UI, via the `en-AU` fallback, never as an error.

There is no dead-key detection either. Several `ui.json` entries name components that hardcode their English strings instead of calling `t()`.

Ownership follows the namespace, not this directory: `finance.json` belongs to whoever changes the finance app.
