---
name: design-defer-feedback
description: Turn a design-playground comment that was rejected as "not now" into a POPS Huly issue, reply on the thread with the issue id, and leave the thread rejected. Use when feedback is deferred rather than refused — never to act on the comment itself.
---

# Defer design feedback to a ticket

A rejection is often "not now" rather than "no". Left in the thread, that
decision is work nobody will do: the thread is closed and nothing schedules it.
This skill writes it down where the backlog is.

It takes **one thread id**. It does not apply the comment, and it does not
decide that a comment should be deferred — the reply explaining the deferral
must already exist, or be written by the person asking.

## Find the thread

The `design-feedback` MCP server has no lookup by id. Call `list_threads` with
`includeResolved: true` and take the thread whose `id` matches. If none does,
stop and say so.

The thread must be `rejected`, or `open` with a reply that gives the reason for
deferring. Anything else stops here:

- `applied` — the work is done; there is nothing to defer.
- `outdated` — the anchor no longer resolves; a ticket would point at nothing.
- `open` with no reason — reply first with **why it is deferred**, in the
  reviewer's terms, before anything else. A ticket that cannot say why it was
  not done now is not worth filing.

## Do not file it twice

Before creating anything, check both places a previous run would have left a
mark:

1. The thread's replies. A reply of the form `Deferred to POPS-NNNN.` means it
   is filed — report that id and stop.
2. Huly: `fulltext_search` for the thread id. The issue body carries it (below),
   so a hit is the existing issue — reply on the thread with its id if the
   thread lacks one, report it, and stop.

## Write the issue

Huly, project POPS. Title it after the change the comment asks for, not after
the thread.

The body needs, in this order:

1. **The comment** — the message, verbatim, and who left it.
2. **Why it was deferred** — the deferral reply, verbatim.
3. **Where** — the anchor, exactly as the thread carries it:
   - `source` — the `pillars/design/src/…:<line>` path and line;
   - `token` — the tokens-sheet row;
   - `selector + excerpt` — both, and say this anchor drifts.
     Plus the route, theme and viewport it was seen under.
4. **Back to the thread** — the playground address (the thread's route) and the
   thread id, on a line of its own as `Design thread: <id>`. That line is what
   the duplicate check above searches for.

Every ticket gets an estimate: calibrate against two or three closed POPS
tickets of similar shape and **say which** in the body. The owner defaults to
Joao unless the work clearly belongs elsewhere.

## Then

1. `reply_to_thread` with exactly `Deferred to POPS-NNNN.` — the form the
   duplicate check reads.
2. Leave the status `rejected`. If the thread was `open`, `set_thread_status`
   to `rejected` now that the reason is written. **Never `applied`**: nothing
   was changed.
3. Report the issue id.

## Do not

- Do not edit the design to half-address the comment on the way past.
- Do not defer a comment that asks a design question. That is an experiment
  (`design-new-experiment`), not a ticket.
- Do not batch threads into one issue unless they ask for the same change;
  one thread, one issue keeps the duplicate check exact.
