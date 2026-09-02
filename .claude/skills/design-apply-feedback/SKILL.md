---
name: design-apply-feedback
description: Act on comment threads left on the POPS design playground — read them, make the change at the anchored file and line, reply, and set the thread's status. Use when there is feedback waiting, or when asked to work through design comments.
---

# Apply design feedback

A comment on the playground names a file and a line. Acting on it is editing
that file, replying so the commenter can see what happened, and closing the
thread. A thread left open is a question the reviewer will ask again.

## Read

Use the `design-feedback` MCP server's `list_threads`. It returns **open**
threads only unless you ask otherwise, which is what you want — start there.

Each thread carries the route it was left on, the theme and viewport it was
seen under, and an anchor. Read the anchor before the message:

- **source** — `pillars/design/src/…:<line>`, stamped at build time. This is
  the file to edit. It is exact; do not go looking for a better one.
- **token** — a row of the tokens sheet. The comment is about the token, not
  about one screen that uses it.
- **selector + excerpt** — the weakest anchor, and the one that drifts. Confirm
  the excerpt still matches what is on screen before editing anything; if it
  does not, the thread is `outdated`.

## Act

1. Make the change. Screens, experiments and fixtures live under the design
   surface; a change confined there skips the LLM review, and a change outside
   it does not.
2. `cd pillars/design && pnpm test`.
3. `reply_to_thread` with **what you changed**, in one or two sentences. Not
   "done", not a summary of the diff — the sentence a person needs to see the
   change without opening the file.
4. `set_thread_status`:
   - `applied` — the change is made.
   - `rejected` — you are not making it. **Reply with the reason first.** A
     rejection with no reason is worse than an open thread.
   - `outdated` — the anchor no longer resolves to what was commented on.
5. Commit. One thread, one commit, where the threads are unrelated; a run of
   comments on one screen can be one commit.

## Do not

- Do not decide a design question a comment asks. If the comment is "should
  this be a table or a list", that is an experiment (`design-new-experiment`),
  not an edit.
- Do not close a thread you did not act on to tidy the list.
- Do not reply to say you are about to start.
