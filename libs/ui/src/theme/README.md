# Theme

The token contract every `@pops/ui` component styles against, and the only stylesheet the React frontend (shell + pillar apps) uses. Tailwind v4 configured in CSS — there is no `tailwind.config.ts`. The one other stylesheet in the repo, `pillars/docs/src/styles.css`, is standalone: its own hardcoded palette, no connection to this layer.

## It is imported exactly once

`pillars/shell/src/main.tsx` does `import '@pops/ui/theme'`; Storybook's `.storybook/preview.tsx` does the same for its own surface. Pillar apps must not import it again — they compile into the shell's single Vite/Tailwind build and inherit it.

Which files Tailwind scans is governed by the `@source` globs at the top of `globals.css` and guarded by `scripts/check-tailwind-source-coverage.mjs`; read that script's header before touching either.

## What the token layer covers

Beyond the shadcn set (`background`, `card`, `primary`, `muted`, `border`, `ring`, sidebar, charts), the file defines semantic status tokens (`--success`/`--warning`/`--info` with foregrounds), a `StatCard` palette (`--stat-sky`/`-violet`/`-rose`/`-orange`, each with a foreground), and sizing tokens with no clean Tailwind scale equivalent — dialog widths and viewport caps, tree indent steps, the tooltip arrow offset. All colours are OKLCH. `:root` holds the light values and `.dark` overrides most of them — the five `--chart-*` colours, `--radius`, and the dialog/tree/tooltip sizing tokens have no dark override, so charts paint their light-mode colours in dark mode.

Three groups are deliberately theme-invariant, with no `.dark` override on purpose: `--qr-*` (an inverted QR refuses to scan on some handsets), `--print-*` (paper is white whichever theme the screen is in — only `print:` utilities may use these), and `--brand-gradient-*` (the POPS wordmark reads the same in both themes).

## `.app-*` accent classes

Apply one of `app-emerald`, `app-indigo`, `app-amber`, `app-rose`, `app-sky`, `app-violet` to an ancestor and every descendant using `bg-app-accent` / `text-app-accent` retints. Each class also overrides `--primary`, so it re-tints token-driven components that never mention `app-accent` at all. This is the mechanism behind per-pillar identity — set it once at the surface root, not per component.

## Graph colours

`graph-colors.ts` is a separate export (`@pops/ui/theme/graph-colors`) with hardcoded hex, for the reason its header gives. Its only consumer is `pillars/inventory/app/src/components/connection-graph/draw.ts`.

## Do not reach for a raw palette colour

Status and category badges take their tones from `../components/statusBadgeTones.ts`, re-exported from the package root as `statusBadgeToneClass` so pillar frontends share the same strings instead of re-deriving them.

This is a gate, not a preference: `scripts/ci/check-design-tokens.mjs` fails the build on a raw Tailwind palette utility or a colour literal in a class string anywhere in frontend source. If no token fits, add one here rather than reaching for the palette.
