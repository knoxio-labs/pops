---
name: design-monitor-feedback
description: Wait for new comments on the POPS design playground and act on them as they arrive. Use for an unattended review session — the reviewer comments, the session applies.
---

# Wait for design feedback

For the loop where a reviewer works through the playground while a session
follows behind them.

```bash
node scripts/design-feedback-watch.mjs
```

It blocks until a comment appears and then exits, the same shape as
`gh run watch` — run it in the **background** so the harness re-invokes the
session when it fires. Do not poll `list_threads` on a timer: a session ticking
every thirty seconds burns a request per tick for hours and sees nothing.

It gives up after 30 minutes (`WATCH_MAX_MS`) so a watcher is re-armed
deliberately rather than running forever. When it exits without a comment, that
is not a failure — re-arm it, or stop if the session is over.

When it fires, run `design-apply-feedback`. Then re-arm.

## Before starting

`POPS_DESIGN_FEEDBACK_URL` and the Access service-token variables must be in
the repo-root `.env` — see `.env.example`. Without them the watcher exits
immediately with an error, and that error is the answer: there is nothing to
watch, not a bug to work around.
