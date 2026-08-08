# @pops/overlay-ego

The Ego assistant: a chat panel plus the React Query hooks that drive it, packaged as a lib so two surfaces render the same conversation state — the shell's floating overlay and the `/cerebrum/chat` route.

## Consumers

- `pillars/cerebrum/app` — `pages/ChatPage.tsx` renders `ChatPanel` with `useChatPageModel`, and re-exports both from its own barrel.

## The backend seam

`src/ego-api/` is generated and never hand-edited — see `openapi-ts.config.ts` and `src/ego-api-runtime-config.ts` for what it is projected from and what base URL it is pinned to.

This is a cross-pillar generated client of the kind ADR-040 governs. It sits outside `pillars/*/app`, so it isn't a row in `app-quality.yml`'s per-app matrix; instead `quality.yml`'s `generated-clients` job regenerates and diffs it (and anything else outside that matrix) via `scripts/ci/check-generated-clients.mjs --exclude-app-matrix`, discovered from this package's own `generate:ego-client` script rather than a hardcoded name.

## Things that bite

- **`ChatInput` translates against the `cerebrum` namespace, but this package does not depend on `@pops/locales`.** Its tests read `src/__fixtures__/cerebrum-en-AU.json`, a hand-copied duplicate of `libs/locales/en-AU/cerebrum.json`. Nothing keeps the two in sync: add a key consumed here and the fixture needs the identical edit, or the test asserts a raw key string.
