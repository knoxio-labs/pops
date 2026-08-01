# @pops/overlay-ego

The Ego assistant: a chat panel plus the React Query hooks that drive it, packaged as a lib so two surfaces render the same conversation state — the shell's floating overlay and the `/cerebrum/chat` route.

## Consumers

- `pillars/cerebrum/app` — `pages/ChatPage.tsx` renders `ChatPanel` with `useChatPageModel`, and re-exports both from its own barrel.

## The backend seam

`src/ego-api/` is generated and never hand-edited — see `openapi-ts.config.ts` and `src/ego-api-runtime-config.ts` for what it is projected from and what base URL it is pinned to.

This is a cross-pillar generated client of the kind ADR-040 governs, but it is **not** covered by the `cross-pillar-clients` job in `.github/workflows/quality.yml`, which regenerates and diffs only the `app-food → lists` and `app-finance → contacts` legs. Nothing fails when a cerebrum contract change leaves this client behind; regenerating is manual and unprompted.

## Things that bite

- **`ChatInput` translates against the `cerebrum` namespace, but this package does not depend on `@pops/locales`.** Its tests read `src/__fixtures__/cerebrum-en-AU.json`, a hand-copied duplicate of `libs/locales/en-AU/cerebrum.json`. Nothing keeps the two in sync: add a key consumed here and the fixture needs the identical edit, or the test asserts a raw key string.
