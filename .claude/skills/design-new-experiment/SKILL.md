---
name: design-new-experiment
description: Open a design experiment on a screen in the POPS design playground — one question, two or more variants to answer it. Use when a screen's design is genuinely undecided and the alternatives are worth seeing side by side.
---

# Open a design experiment

An experiment is a question with variants attached. It exists so a choice is
made by looking rather than by arguing, and it is worth opening only when the
alternatives would actually be built differently.

## Before scaffolding

1. Read `pillars/design/README.md` if you have not this session.
2. Name the **question**, in one sentence, in the terms a reviewer would use —
   "does the review step read better as a dense table or a card grid" — not
   "improve import review".
3. Check the screen has no active experiment already: at most one is allowed
   per screen and the registry rejects a second. `rg 'screen: <screen-id>'
pillars/design/src/experiments/*/experiment.yaml`.
4. Decide the variants. Two is usually right. A variant that differs only in a
   value (a padding, a colour) is a tweak, not a variant — make it a state or
   just change it.

## Scaffold

```bash
node scripts/design-new-experiment.mjs <id> \
  --screen <screen-id> \
  --name "Display name" \
  --question "The question, as a sentence." \
  --variant <a> --variant <b>
```

The script copies the main screen into each variant when there is one, so the
first diff is the change being proposed rather than a blank file. It refuses to
overwrite anything.

## Then

- Make each variant _actually_ different. A variant identical to the main
  screen answers nothing.
- Keep every variant on the same fixtures. Two designs shown different data are
  not comparable, and the reviewer will notice the data instead of the design.
- `cd pillars/design && pnpm test` — the render smoke test mounts every variant,
  step and state, and `catalog.test.ts` fails on any contract error.
- Commit as `design(<area>): <question, shortened>`. Surface-only changes under
  `src/screens`, `src/experiments` and `src/fixtures` skip the LLM review; a
  commit that touches anything else does not.

One experiment, one commit. Deciding it is `design-decide-experiment`.
