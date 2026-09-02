---
name: design-archive-experiment
description: Archive a POPS design experiment that was abandoned rather than decided — the question stopped mattering, or the screen it explored is gone. Use instead of deleting it.
---

# Archive an experiment

For an experiment nobody will decide: the question was overtaken, the screen was
cut, the approach was abandoned. Archiving keeps the record; deleting destroys
the only trace that the question was asked.

In `pillars/design/src/experiments/<id>/experiment.yaml`:

```yaml
status: archived
rationale: Why it stopped mattering. One sentence.
```

An archived experiment no longer holds its screen, so a new experiment can be
opened on it. Leave the variants on disk.

Delete an experiment only when a human asks you to, and say what will be lost
before you do.

Commit as `design(<area>): archive <experiment name>`.
