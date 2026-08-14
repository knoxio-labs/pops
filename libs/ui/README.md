# @pops/ui

The component library every POPS frontend renders through. `src/primitives/` wraps Shadcn/Radix; `src/components/` combines those into the domain-shaped widgets pillars actually mount — tables, pickers, wizards, badges, charts. The barrel `src/index.ts` is the public API, and no consumer is allowed to reinvent something it already exports.

## Consumers

Every frontend surface in the repo:

- `pillars/{finance,media,food,inventory,cerebrum,ai,lists}/app` — all page and section UI.
- `pillars/shell` — chrome and layout, plus the only production `import '@pops/ui/theme'`.
- `libs/navigation` — `Button` + `Input` in the search field and mobile search overlay.
- `libs/overlay-ego` — the chat panel chrome.

Nothing server-side consumes this lib.

## Search before you build

The reuse rule (AGENTS.md) only works if you can see what already exists — and grepping the barrel does not show you. Most of `src/index.ts` is `export * from './primitives/<file>'` / `'./components/<Name>'` lines, so a star-re-exported name is not in the file: `Badge`, `Skeleton`, `Input`, `Dialog`, `Card` and `Table` all arrive through a lowercase module path. Search the source:

```
find libs/ui/src -name '*.tsx' | xargs grep -l '<keyword>'
ls libs/ui/src/components libs/ui/src/primitives
```

Story coverage is a gate: `scripts/check-storybook-coverage.mjs` fails when a barrel-exported `.tsx` module no story imports appears, unless it is listed in `scripts/storybook-coverage-allowlist.mjs`. That allowlist is the pre-existing debt. What the gate enforces is that entries stay honest and that the list does not grow behind your back: a stale entry — one whose module has since gained a story, or stopped being exported — fails, an entry without a reason fails, and `scripts/__tests__/check-storybook-coverage.test.ts` pins the entry count, so taking new debt on means editing that number in the same diff. Adding an entry is allowed; adding one quietly is not. **Absence from Storybook is still not absence from the library** until the list is empty.

## What first-time consumers get wrong

- **Three names are taken twice.** The barrel exports the _composite_ `Button`, `Select` and `DropdownMenu`; the raw Radix versions come out aliased as `ButtonPrimitive`, `SelectPrimitive`, `DropdownMenuRoot`. Grabbing the wrong one compiles and behaves differently. There is no `@pops/ui/primitives/<name>` subpath — the directory mixes `.tsx` and `.ts` files, which a wildcard export target can't serve correctly through both `tsc` and Vite, so every primitive is reached through the barrel above instead.
- **Four components need an i18next provider.** `DataTable.pagination`, `DataTable.toolbar`, `FileUpload.parts` and `ErrorAlert` call `useTranslation('ui')`. This lib never initialises i18next — the shell does, with the `ui` namespace from `@pops/locales`. Render them anywhere else and they show raw keys. (`@pops/locales` is a devDependency here purely to bootstrap `src/test-setup.ts`.)
- **A Tailwind class exists only if `theme/globals.css` scans the file using it.** See `src/theme/README.md`.
- **`tsconfig.json` excludes `*.stories.*`**, so `mise run typecheck` will not catch a story that no longer compiles. `src/story-smoke.test.tsx` will: it composes every story with portable stories and renders it in the normal vitest run, so a story that throws, renders nothing, or logs a React error fails `mise run test`.
- **`QrCode` does not follow the theme, and that is deliberate.** `--qr-module` / `--qr-quiet-zone` are defined once in `:root` and never overridden in `.dark`: an inverted QR is outside what most phone camera scanners implement, so a themed symbol would render beautifully and refuse to scan on some handsets. It also renders SVG rather than canvas, which is what makes `@pops/ui/testing/decode-qr` possible — that subpath rasterises a rendered symbol and decodes it with `jsQR`, so a consumer can assert what its QR actually encodes instead of asserting a prop reached the component. That is why `jsqr` is a dependency and not a devDependency.

## Constraints

- A lib must never import a pillar (`scripts/ci/check-lib-no-pillar-import.mjs`). Storybook is a deliberate exception; how it reaches pillar frontends without a workspace edge, and what a new frontend pillar must add, is in `scripts/check-storybook-coverage.mjs`.
- Storybook's browser surface is local: no CI job runs `build-storybook`, deploys it, or diffs screenshots. What CI does run is every story as a jsdom smoke test (above), which is a different and weaker claim — it proves a story mounts, not that it looks right.
- Coverage thresholds in `vitest.config.ts` are nominal. The story smoke test walks most of the lib, so line coverage now says very little about how well any component is actually asserted on.
