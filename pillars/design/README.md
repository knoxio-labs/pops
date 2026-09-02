# @pops/design

The design playground: a UI pillar where a screen is designed on the product's own tokens and components before anything implements it. It owns no database, serves no contract and registers nothing — like `pillars/docs`, it is a static bundle built by Vite and served by nginx, and the shell's nginx proxies it at `/design/`.

It is a port of [knoxio/design-playground](https://github.com/knoxio/design-playground) with the parts that only made sense for an agency removed: there is one client, one token layer, and no theme engine of its own. Everything on the canvas renders through `@pops/ui` and `libs/ui/src/theme/globals.css`, so a design here is already the product's design.

## The design surface

Three directories under `src/` are the surface a designer edits. Nothing in them is registered anywhere: a file in the right place is discovered by `src/registry/catalog.ts`, and a file in the wrong place is a contract error listed in the sidebar rather than a crash.

```
src/screens/<area>/<screen>.tsx           a screen: default export + `meta`, optional `states`
src/screens/<area>/<flow>/<step>.tsx      a folder is a flow of ordered steps, one level deep
src/experiments/<id>/experiment.yaml      the question, its status, the screen it is about
src/experiments/<id>/variants/<v>/screens/<area>/<screen>.tsx
                                          a variant's screens override main by path
src/fixtures/                             typed, fictional data — no API calls, no contracts
```

A screen exports what `src/contract.ts` describes: a default component, a `meta` with a `title` (and an optional `order`), and optionally a `states` map of named render thunks — `empty`, `error`, `row-selected` — each rendering the component under that condition. The default render is the implicit `default` state.

An experiment is a question about one screen. Its variants are the competing answers; each variant's screens overlay main by relative path, so flipping a variant always shows a complete app. At most one active experiment sits on a screen. Deciding one is a merge (the chosen variant's screens are copied into main and `chosen` and `rationale` are recorded); `archived` closes it without a decision. Both leave the sidebar; the overview still lists them.

Areas are the first directory under `screens/` and group the sidebar. Use the pillar id the screen belongs to (`finance`, `media`) or a cross-cutting name (`shell`, `ios`).

## The address

Every reviewable surface has one URL, built and parsed by `src/shell/address.ts`:

```
/design/[x/<experiment>/<variant>/]s/<area>/<screen>[/<step>][?state=<state>][#<anchor>]
```

No `x/…` segment means main. `/<step>` appears only when the screen is a flow. `?state=` selects a named state. Switching one coordinate keeps the others where the target has them and drops to the nearest valid parent where it does not.

## The canvas is always a frame

The chrome (sidebar, dock) and the surface are two documents: the surface renders in a same-origin iframe at `/design/frame/…`, at full size or at a simulated viewport. This is deliberate. The canvas theme is a class on the frame's document, so a light canvas inside a dark chrome never inherits the wrong tokens, and responsive utilities respond exactly as they would on the device. The frame reports its navigation to the shell over `postMessage` (`src/shell/viewport.ts` carries the message types) and the shell mirrors it in the address bar; theme changes travel the other way, so the frame never reloads for them.

The dock's theme tool switches exactly what the product can switch: light or dark, and one of the six `.app-*` accents from the theme layer. The tokens sheet at `/design/tokens` reads the resolved value of every colour token under the theme on the canvas.

## Commands

```bash
pnpm --filter @pops/design dev          # Vite on http://localhost:5569/design/
pnpm --filter @pops/design build        # tsc + vite build into dist/
pnpm --filter @pops/design typecheck
pnpm --filter @pops/design test         # registry, address and theme units + a render smoke of every screen
```

`mise tasks` (from this directory's `mise.toml`) wraps the same set plus `lint`.

## Tests

`src/registry/catalog.test.ts` runs discovery against the checked-in surface and fails on any contract error, so a screen or experiment committed in the wrong shape fails CI without the test knowing it by name. `src/test/render-smoke.test.tsx` mounts every screen, step, state and variant once. The rest are unit tests over the pure modules: the screen collector, the schemas, the lineage rules, the address grammar, the viewport maths and the theme encoding.

## Image

`infra/docker-compose.yml` runs the image as `pops-design` on the frontend network, and the shell's nginx proxies `/design/` to it, so it sits behind the same Cloudflare Access the shell does. `.github/workflows/publish-images.yml` publishes it with the other frontend images.

`Dockerfile` builds the bundle in a `node:24-alpine` stage and serves it from `nginx:1.31.3-alpine` with `nginx/default.conf`. The bundle is built with `base: /design/`, and the conf serves the same tree at `/` (what the shell's proxy forwards after stripping the prefix) and at `/design/` (a direct hit on the container), with `index.html` forced to revalidate so a rebuilt image is seen.
