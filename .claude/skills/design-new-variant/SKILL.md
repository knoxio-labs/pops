---
name: design-new-variant
description: Add a variant to an existing design experiment in the POPS design playground. Use when a third answer to the experiment's question is worth seeing, not when an existing variant needs editing.
---

# Add a variant

Only when it answers the experiment's question _differently_. Editing a variant
is editing a file; this is for a new answer.

```bash
node scripts/design-new-experiment.mjs <experiment-id> --variant <variant-id>
```

The script reads the experiment's `screen` from its `experiment.yaml`, so pass
only the variant. It refuses to overwrite an existing one.

Then:

1. Add the display name to `variants:` in `experiment.yaml` — a variant without
   one shows its bare id in the dock.
2. Build the variant against the **same fixtures** as its siblings.
3. `cd pillars/design && pnpm test`.
4. Commit as `design(<area>): <what this variant tries>`.

If the experiment's `status` is not `active`, stop and ask: adding a variant to
a decided experiment either reopens it or is a mistake, and which one it is is
not yours to assume.
