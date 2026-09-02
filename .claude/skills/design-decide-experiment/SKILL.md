---
name: design-decide-experiment
description: Record the decision on a POPS design experiment — which variant won and why. Use when a human has chosen; never to make the choice.
---

# Decide an experiment

**You do not decide.** The choice is the reviewer's; this records it. If nobody
has chosen, say so and stop.

Edit `pillars/design/src/experiments/<id>/experiment.yaml`:

```yaml
status: decided
chosen: <variant-id>
decided: YYYY-MM-DD
rationale: Why this one, in the reviewer's terms. One or two sentences.
```

Rules the registry enforces, so get them right first time:

- `chosen` must name a variant that exists in this experiment.
- `status` moves `active → decided`. Leave the losing variants in place: the
  rationale is only readable next to what was rejected.

The rationale is the part that matters later. "Cards" is not a rationale.
"Cards, because the table hid the entity line and that is the field being
corrected" is.

Do not delete anything, do not copy the winner into an app, and do not open a
follow-up ticket here — `design-promote` writes the issue when the work is ready
to be implemented.

Commit as `design(<area>): decide <experiment name>`, and say in the body what
was chosen and why.
