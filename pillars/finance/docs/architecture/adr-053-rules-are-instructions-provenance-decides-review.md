# ADR-053: Rules are instructions; provenance decides review

## Status

Accepted — 2026-09-07.

## Context

`transaction_corrections.confidence` (and its tag-rule sibling) has been doing
three unrelated jobs, fed by three incommensurable sources, compared against
two constants nothing ties together.

The jobs:

1. **A hard filter.** `findAllMatchingCorrectionFromRules` and the DB matching
   services drop any rule below `MIN_MATCH_CONFIDENCE` (0.7) before matching
   even runs. A rule under the floor is invisible — stored, listed, rendered
   like any other rule — and nothing on the rule card says so.
2. **A routing bar.** `classifyCorrectionMatch` calls a match `matched` at or
   above `HIGH_CONFIDENCE_THRESHOLD` (0.9), `uncertain` below it. This decides
   whether a row needs the user's attention.
3. **A tiebreak — but only for tag rules.** `tag-rule-matching.ts` orders
   `priority ASC, confidence DESC`. Correction-rule precedence
   (`compareRuleScope`, then `priority`, then `id`) never consults confidence
   at all, so the number does not even do the one job most readers assume it
   does.

The sources feeding it are not the same quantity: an invisible 0.7 default
minted for every rule written by hand (`applyAddOp`,
`contract/corrections-pure.ts:155`), a score an AI proposal invents for
itself, and the entity matcher's own self-assessment. A human's explicit
instruction and a model's guess are compared against the same 0.9 line as
though they measured the same thing.

**POPS-3120** is the failure this produces. A user writes "this descriptor is
a transfer" in Manage Rules. It stores at 0.7 — the invisible default — which
clears the matching floor (job 1), so the ChangeSet preview correctly says the
rule covers the row. Re-evaluation then classifies the outcome as `uncertain`
(job 2) for a row already sitting in `matched`, and the re-evaluation's
matched-row path discarded any outcome that was not `matched` outright — a
guard originally written (#3814) to stop a settled row being demoted back to
review, which quietly also stopped it being _changed_ at all. The rule
previewed as applying and then did nothing, with no error and no signal why.

Two invisible thresholds, crossed by a number nobody chose, on the one class
of rule — human-authored — that should never have been probabilistic in the
first place.

## Options considered

| Option                                                           | Pros                                                                                                                                 | Cons                                                                                                                                                                          |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fix POPS-3120 locally, leave confidence as-is                    | Smallest change                                                                                                                      | The mechanism that produced it is untouched; the next hand-written rule at 0.5 vanishes from matching with no signal, or a routing-adjacent path rediscovers the same discard |
| Make the 0.7 default explicit in the rule editor, keep both bars | Confidence stays a real, chosen number                                                                                               | Still asks the author of an instruction to also estimate their own confidence in it — a category error, and still two constants nothing ties together                         |
| **Confidence stops being a decision input — chosen**             | Matching and routing each ask one true question; a human's rule and a model's guess are no longer forced through the same comparator | Touches matching, routing, the proposal-accept path, the rule editor and its contract surface — the largest option, done as an epic (POPS-3126) rather than one PR            |

## Decision

**Matching asks only: is the rule active, in scope, and does the pattern
match.** No confidence floor. A stored rule — however it was authored — is a
matching candidate on those three facts alone.

**Review routing asks: who decided this row, not how sure they were.** A
correction rule (any confidence) or a human resolving a row by hand is
settled — `matched`. An AI-derived or heuristic match is `uncertain`,
whatever score the model attached. An entity-less `purchase` rule still
leaves a row `uncertain`, but because there is no merchant yet — a provenance
fact — not because of where a number falls.

**A rule is an instruction, not a hypothesis.** Once accepted — whether typed
by hand or accepted from an AI proposal — it applies unconditionally. The
probabilistic moment is upstream of that: an AI proposal keeps its score
_while it is still a proposal_, and the score is what a human uses to decide
whether to accept it. Acceptance is the event that turns a guess into a rule;
after that event nothing about the rule is provisional.

**`confidence` (and commit-time `matchConfidence`) survive as audit data.**
Recorded on AI-derived matches so it is possible to ask later "how sure was
the model when this landed", never read to decide anything. A hand-written
rule's `confidence` column stops being minted with an invented number
(POPS-3130 decides its literal representation — `null` vs `1` — as a
follow-on to this ADR, not as part of it).

**Tag-rule ordering drops confidence from its comparator**, matching
correction-rule precedence: `priority`, then a stable tiebreak. Confidence was
never load-bearing here on purpose; it was load-bearing by accident, because
it was the closest number lying around.

## Consequences

- `HIGH_CONFIDENCE_THRESHOLD` and `MIN_MATCH_CONFIDENCE` lose every caller
  that decides something once routing (POPS-3128) and the matching floor
  (POPS-3129) are gone. `HIGH_CONFIDENCE_THRESHOLD` is deleted in this
  change (POPS-3128) — it was declared **twice**, `contract/corrections-pure.ts`
  and `api/modules/corrections/types.ts`, re-exported from both barrels, with
  no test tying the two together, so both copies go the moment routing stops
  reading either. Same value today by luck, not by any guard; worth
  remembering the next time a constant this load-bearing is worth copying
  rather than importing. `MIN_MATCH_CONFIDENCE` outlives it — the invented
  default and the schema/validation floor still read it until POPS-3130 — and
  is deleted last, in POPS-3132.
- Removing the matching floor (POPS-3129) makes any rule stored below 0.7
  live for the first time. Nothing writes one by hand once POPS-3130 lands,
  but an AI proposal could have minted one before this ADR. What is actually
  in prod below the old floor must be enumerated before that change merges —
  a data question, not a code one.
- Rule cards stop rendering a confidence percentage next to a rule that, post
  epic, is unconditional (POPS-3131) — the number was actively misleading
  once "confidence: 70%" no longer meant "usually", it meant nothing.
- `docs/architecture` conventions are per-pillar (see ADR-050 through
  ADR-052); this ADR extends none of them directly but sits beside them —
  corrections and imports are as central to `finance` as accounts and
  balances.
- The corrections and imports module READMEs currently describe the 0.9/0.7
  split as the ladder's classification rule
  (`api/modules/imports/README.md`, "Learned corrections" bullet;
  `api/modules/corrections/README.md`, the "type-only rules are terminal"
  bullet's "no matter how confident the rule is" aside). Both are rewritten
  in POPS-3128 to describe provenance instead of restating this ADR. The
  account-scope bullet's separate "regardless of `priority` or `confidence`"
  aside needs no rewrite — it already describes ordering, not routing, and
  was accurate before this ADR too.
- `classifyCorrectionMatch`, `resolveCorrectionApplyStatus` and
  `correctionOutcomeBucket` are the three functions whose docstrings
  currently explain the confidence bar; POPS-3128 rewrites them to explain
  provenance in its place, rather than leaving the old rationale to be
  rediscovered by whoever touches them next.

## Sequence

POPS-3126 (epic) → POPS-3127 (this ADR) → **POPS-3128** (routing moves to
provenance, and deletes `HIGH_CONFIDENCE_THRESHOLD`) → **POPS-3129**
(matching floor removed) → POPS-3130 (tag-rule ordering, stop minting the
0.7 default) → POPS-3131 (UI) → POPS-3132 (delete `MIN_MATCH_CONFIDENCE`,
the one constant still standing).

Routing before the floor, deliberately: dropping the floor while the 0.9 bar
still stood would put sub-0.9 rules in front of rows only to have their
outcome discarded there — a wider version of the exact defect POPS-3120
reported.

## Related

- POPS-3120 — the reported defect, fixed in #4527, and the worked example
  this ADR generalises from.
- POPS-3121 — a different mechanism (the client's manually-resolved-checksum
  pin) producing the same _shape_ of complaint: an instruction the user gave
  is silently unable to reach a row. Independent of this ADR.
- POPS-2600 — the four-independent-implementations story for pattern
  matching; the duplicate `HIGH_CONFIDENCE_THRESHOLD` above is the same
  lesson in miniature.
