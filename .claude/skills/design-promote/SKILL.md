---
name: design-promote
description: Turn a decided POPS design experiment into a Huly issue an implementing PR can start from. Use once a design is settled and the work is ready to be scheduled — never to copy a design into an app.
---

# Promote a decided design

**Nothing is copied into an app.** The playground is where a design is decided;
the implementation is a separate PR written against the app's own code. This
skill writes the issue that PR starts from.

## Preconditions

The experiment's `experiment.yaml` has `status: decided`, a `chosen` variant,
and a `rationale`. If it does not, stop: promoting an undecided design is
asking someone to implement a guess. Run `design-decide-experiment` first, or
say who needs to choose.

## Write the issue

In Huly, project POPS, component `ui`. Title it after the change, not after the
experiment.

The body needs, in this order:

1. **What was decided** — the chosen variant and the `rationale`, verbatim.
   The rationale is why this ticket exists at all.
2. **What was rejected** — the other variants, one line each. An implementer
   who does not know what was tried re-tries it.
3. **The screens** — every screen id the chosen variant defines, with its
   playground address (`/x/<experiment>/<chosen>/s/<screen-id>`) so the
   reviewer can open the thing being described.
4. **The states** — every named state in the chosen variant. States are where
   an implementation quietly diverges: `empty` and `error` are the ones that
   get dropped.
5. **Files to start from** — the variant's screen files and the fixtures they
   read, as repo paths. These are the reference, not the source: the
   implementation targets the app package, and the fixture is a fixture.
6. **What the playground did not answer** — real data volumes, loading
   behaviour, i18n, and (for an iOS design) Dynamic Type, which the iPhone
   frame does not model.

## Estimate and assign

Every ticket gets an estimate. Calibrate against two or three closed POPS
tickets of similar shape and **say which ones** in the body. In POPS the owner
defaults to Joao unless the work clearly belongs elsewhere.

## Then

Report the issue id. Do not change the experiment's status — a promoted
experiment stays `decided`; it is the record of why the screen looks like that.
