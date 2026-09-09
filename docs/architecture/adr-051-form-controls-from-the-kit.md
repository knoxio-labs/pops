# ADR-051: Form controls come from the kit, and gaps are closed in the kit

## Status

Accepted — 2026-09-09

## Context

Epic POPS-3168 audited every pillar frontend for hand-rolled form controls —
raw `<select>`, `<input>`, `<textarea>` elements standing in for a `@pops/ui`
primitive — and found dozens. `scripts/ci/check-raw-form-controls.mjs` now
ratchets that count per pillar so it cannot silently grow back, but a guard
only catches the mechanical shape: a raw tag in JSX. It cannot catch the
judgement failure that produced most of what it found, which was not
carelessness but reasoning:

- `lists`' `ShoppingSortDropdown` carried a comment arguing native `<select>`
  was deliberate — "zero deps + mobile OS picker UI." The kit's own `Select`
  **is** a native `<select>` wrapper; the author was solving a problem the
  kit had already solved, without checking.
- `lists`' `ListKindChip` carried a comment arguing app code under `lists`
  should stay free of `@pops/ui`, citing a rule whose source file no longer
  existed.
- Cerebrum's `TagPicker` was a second copy of `ScopePicker`'s interaction
  model, presented in review as a considered choice rather than duplication.

Each of these was an author reasoning carefully about a decision the kit had
already made, and getting a different answer. A grep does not fix that — a
document that states the invariant and forecloses the argument does.

## Decision

**Pillar UI does not render a raw `<select>`, `<input>`, or `<textarea>`.**
Every form control a pillar needs comes from `@pops/ui`. The guard enforces
the mechanical half of this; this ADR is the reasoning half, so that a
developer who trips the guard has somewhere to go besides re-deriving the
argument from scratch.

**When the kit doesn't do what a screen needs, the kit is extended.** A local
workaround — a hand-rolled dropdown, a bespoke date field, a second copy of
an existing kit interaction — is the thing this decision rules out, not a
fallback it tolerates. The epic's own tickets are the worked examples of
what "extend the kit" looks like in practice:

- `FieldLabel` gained `required` / `error` / `description` slots (POPS-3169)
  instead of every consumer hand-rolling a label block.
- `TreeView` gained roving-tabindex arrow-key navigation (POPS-3172).
- `TreePicker` gained a footer slot for clear-selection and a persistent
  create row (POPS-3173).
- `ChipInput` gained filtered suggestions, built on Radix `Popover` and
  cmdk's `Command` (POPS-3171).
- `DateRangeField` gained period presets (POPS-3174).
- `NumberInput` gained an empty/unset state, distinct from zero (POPS-3202).
- `DateInput` gained an `error` prop (POPS-3181).
- `Autocomplete` gained a `loading` prop so it suppresses its empty-state
  message while a request is in flight, instead of flashing "no results"
  before the first response lands (POPS-3179).
- The primitives layer gained a `CommandBareInput`, an unstyled input driven
  by cmdk's `Command`, for callers building their own combobox chrome
  (POPS-3181).
- `@pops/date`, a new shared lib, gained finance's local-date module,
  lifted out and shared rather than left as a single pillar's private
  helper (POPS-3170). Its discipline is local-anchored versus UTC-anchored
  day arithmetic: derive "today" from a `Date`'s own local getters, then
  walk forward or backward by whole days with fixed-width UTC arithmetic —
  never the reverse. Reading a local `Date` through `toISOString()`'s UTC
  getters silently returns the wrong calendar day for part of every day in
  any zone ahead of UTC. The same principle applied to date-handling logic
  rather than to a rendered control: a pillar re-deriving this locally was
  the same failure as a pillar reaching for its own `<select>`.

None of these needs was imagined; each came from a screen that had already
tried to route around the kit and been redirected into it instead.

**A control's behaviour is the kit's responsibility, not the call site's.**
Native mobile picker UI, `lang` locale pinning on dates, keyboard navigation,
ARIA wiring — these are exactly the reasons an author reaches past the kit,
and exactly what the kit components above now own. This is what actually
answers the `ShoppingSortDropdown` argument, rather than merely overruling
it: "native is deliberate" was never in tension with using kit `Select`,
because kit `Select` already is native. A pillar has no standing reason to
reach past the kit for behaviour the kit already owns; if it finds one, that
is a kit gap, and the fix is the same as above — extend the kit, file the
ticket, don't work around it locally.

**A comment that justifies diverging from the kit must cite something that
currently exists.** `ListKindChip`'s divergence outlived its own
justification: the rule it cited had already been deleted by the time the
comment was read as a reason to keep diverging. A rationale that references
a file, a ticket, or a rule is only as durable as that reference; when the
thing it points to goes away, the rationale needs re-justifying, not
inheriting.

### Deliberate exceptions

A handful of cases render native controls, or diverge from a single shared
implementation, on purpose. None of them is a violation the guard should be
tightened to catch:

- **Shell's dynamic settings renderer**
  (`pillars/shell/src/components/settings/section-renderer/`) is the only
  form renderer in the repo driven by a wire-serialized manifest rather than
  local props: a section arrives from the registry as a Zod-validated
  `SettingsField`, whose `testAction` and `optionsLoader` are JSON-safe
  procedure paths, not callbacks, because they cross a wire. No shared
  `<Form>` component can carry a closure across that boundary, so shell owns
  a small per-field-type dispatcher (`FieldInput.tsx` branching to
  `SelectField`, `TextLikeField`, `ToggleField`, and the rest). This is not
  a case of the kit being bypassed — every one of those per-type renderers
  still leaves its actual control to a kit primitive (`Input`, `Select`,
  `Switch`, `Textarea`); it is only the dispatch and manifest-decoding layer
  above them that is local, because that layer has nothing to do with what
  a form control is. A kit `SettingsForm` existed briefly and was deleted
  (POPS-3175) once it became clear it could not carry this contract — so the
  right framing is that shell's renderer is the only one, and correctly so,
  not that shell "can't yet adopt" a kit version. There is no kit version to
  adopt.
- **`libs/navigation`'s global search** is still a bespoke implementation,
  not built on `Autocomplete` or `ComboboxSelect`, because it needs grouped
  result sections, per-domain result renderers, a debounced remote fetch,
  and a global ⌘K binding that a generic combobox doesn't model. The
  exception is narrower than it once was: POPS-3184 brought its combobox
  ARIA and dismissal behaviour in line with the kit's conventions, and
  POPS-3207 wired its mobile overlay onto the same shared data/handler hooks
  (`useSearchInputData` and friends) the desktop input already used, rather
  than growing a second, divergent implementation for mobile. So the
  exception on record is "not rebuilt on a kit combobox primitive," not "left
  unfixed" — the parts of it a generic gate could have caught (ARIA,
  dismissal, desktop/mobile drift) were fixed within this epic.
- **`purchases/QueueList` and inventory's location-tree row editing** are
  interaction widgets, not form controls, and mostly fall outside the
  guard's scope for that reason — `QueueList` renders no raw `<select>`,
  `<input>`, or `<textarea>` at all. The one place inventory's location
  tree does — its inline rename field — is a deliberate, documented
  exception (POPS-3201): the kit's `TextInput` enforces a minimum height and
  padding sized for a standalone form field, which would grow a compact
  tree row past the sibling icons it swaps in for. The file says so inline,
  citing the ticket, rather than asserting a policy nobody can check.
- **`pillars/design` outside `src/kit/`** is the playground, not shipped
  product surface, and screens there compose fixtures and mockups rather
  than being held to the invariant a pillar's real UI is held to.

### What this decision does not yet claim

Two things the epic did not settle, named here so this ADR does not read as
cleaner than the tree it describes:

- **The guard is not at zero, and `pillars/design` is not fully exempt in
  practice.** Running `node scripts/ci/check-raw-form-controls.mjs` against
  this change reports 54 raw form controls across 6 pillars, matching the
  committed baseline exactly (down from a starting baseline of 90). That
  remainder is overwhelmingly plain text/number inputs and textareas that no
  ticket in this epic was ever scoped to close — `<select>` is nearly gone
  but not quite: three remain, one in finance's own tag-rule dialog and two
  in `design` (its comment-thread status dropdown, and a mockup of that same
  finance dialog under `screens/finance/`). It is not evenly a "deliberately
  exempt" set: `design`'s five carry a raw `<input type="color">` inside
  `src/kit/` itself (no kit colour-picker exists yet) alongside unmigrated
  controls in the pillar's comment-thread UI, which is product surface for
  the reviewer, not a mockup. **POPS-3260** tracks
  deciding what happens to the remaining 54 — whether they get driven to
  zero, whittled to a documented allowlist, or the ratchet is accepted as
  the permanent floor — and is the right place to make and record that call,
  not this document.
- **Error-message placement is not a settled convention.** `FieldLabel`'s
  `error` slot renders above the control it labels; every input that owns
  its own `error` prop (`TextInput` and what's built on it) renders its
  message below the control; `DateInput` renders no message of its own at
  all, documenting that it must pair with `FieldLabel`'s slot for the error
  to appear anywhere. The result, shipping today, is a `TransactionFormDialog`
  and a `CheckpointFormDialog` row where a `TextInput` and a `DateInput`
  each show a validation error on the opposite side of their control from
  the other. **POPS-3247** tracks picking one convention and moving every
  consumer to it; this ADR does not pick one on its behalf.

## Consequences

- A pillar author who wants to reach past `@pops/ui` for a form control now
  has to argue against a decision, not merely raise a preference — and the
  argument that has to win is "the kit cannot do this and extending it is
  wrong," not "I'd rather not."
- The guard (`scripts/ci/check-raw-form-controls.mjs`) references this ADR
  in its violation message, so a developer who trips it lands on the
  reasoning, not just the rule.
- The kit is where new form-control capability gets built. An author who
  hits a limitation extends the relevant `@pops/ui` component (with its
  Storybook story, per the component-library convention) rather than
  reaching for a local one-off — the extension list above is the precedent
  to follow, not a closed set.
- A comment justifying a divergence from the kit must name something a
  reader can go and check — a ticket, a file, a constraint — and stays valid
  only as long as that reference does. A stale citation is the same failure
  as no citation.
- The remaining 54-violation gap and the error-placement inconsistency are
  open, tracked work (POPS-3260, POPS-3247), not gaps this ADR papers over.
  An ADR asserting a clean invariant the tree visibly contradicts would
  teach readers to distrust both the ADR and the guard; naming the gap is
  what keeps the guard worth checking.
