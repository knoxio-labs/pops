# @pops/design

The design playground: a UI pillar where a screen is designed on the product's own tokens and components before anything implements it. It serves no contract and registers nothing — like `pillars/docs`, the playground is a static bundle built by Vite and served by nginx, and the shell's nginx proxies it at `/design/`.

It does own a database, which is the one way it is not like `pillars/docs`: the comment threads left on a design have to live somewhere, and this is where they are written. That store and its API are the pillar's second image — see [Comments](#comments) below.

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

## Comments

Press `i` on the playground and click anything: a comment is pinned to that element and a session can read it, act on it and reply. This is how a design review reaches the code that renders it.

An anchor resolves in three steps, best first. `source-plugin.ts` stamps every host element under `src/screens` and `src/experiments` with its own file and line, so a comment on a stamped element names exactly where to edit and survives any amount of DOM churn. Failing that, a row of the tokens sheet. Failing that, a CSS path plus the text that was on screen — the path alone collapses onto the wrong row the moment a list re-renders.

The overlay renders inside the canvas iframe rather than over it, because anchoring is a hit test against the surface's own document and an overlay in the chrome would have to undo the frame's scale and offset to run one. The shell and the frame exchange two messages for it: comment mode down, the open-thread count up.

Threads live in `src/db`, behind the Express API in `src/api`. Identity is Cloudflare Access: a human session in production, the tunnel's operator when no Access team is configured, and a **service token** for the two headless callers — the Vite dev proxy and `scripts/design-feedback-mcp.mjs`, the MCP server a session reads threads through. A service-token JWT carries `common_name` and no email at all, which is why `libs/sdk/src/access/cloudflare-jwt.ts` grew a principal that is not a person.

A thread is `open`, then `applied`, `rejected` or `outdated`. Reopening one clears the resolution, so "when was this closed" never reads a stale timestamp.

Nothing above is needed to use the playground. With no `POPS_DESIGN_FEEDBACK_URL` in the repo-root `.env` there is no dev proxy, the overlay's identity call fails, and comment mode hides itself. See `.env.example`.

## Commands

```bash
pnpm --filter @pops/design dev          # Vite on http://localhost:5569/design/
pnpm --filter @pops/design dev:api      # the comment API on http://localhost:3015
pnpm --filter @pops/design build        # tsc -b → dist/api + dist/db, vite → dist/web
pnpm --filter @pops/design typecheck
pnpm --filter @pops/design test         # the playground's units and render smoke, plus the API and its store
```

`mise tasks` (from this directory's `mise.toml`) wraps the same set plus `lint`.

## Tests

`src/registry/catalog.test.ts` runs discovery against the checked-in surface and fails on any contract error, so a screen or experiment committed in the wrong shape fails CI without the test knowing it by name. `src/test/render-smoke.test.tsx` mounts every screen, step, state and variant once. The rest are unit tests over the pure modules: the screen collector, the schemas, the lineage rules, the address grammar, the viewport maths, the theme encoding and the comment anchors.

`vitest.config.ts` declares two projects, because the two halves cannot share an environment: the playground runs under jsdom with the React plugin, and the comment API runs under node against real SQLite files on temp paths. The design surface is exempt from the test mandate; `src/api` and `src/db` are not.

## Images

Two, because one cannot be both a static file server and a Node process.

`Dockerfile` builds the playground bundle in a `node:24-alpine` stage and serves it from `nginx:1.31.3-alpine` with `nginx/default.conf`. The bundle is built with `base: /design/`, and the conf serves the same tree at `/` (what the shell's proxy forwards after stripping the prefix) and at `/design/` (a direct hit on the container), with `index.html` forced to revalidate so a rebuilt image is seen.

`Dockerfile.api` builds the comment API on `node:24-slim`, creating and owning `/data/sqlite` so the `pops-design-data` volume is writable on its first ever mount. `infra/litestream/design.yml` replicates it.

`infra/docker-compose.yml` runs them as `pops-design` and `design-api` on the frontend network, and the shell's nginx proxies `/design/` to the first and `/design-api/` to the second, so both sit behind the same Cloudflare Access the shell does. `.github/workflows/publish-images.yml` publishes both.
