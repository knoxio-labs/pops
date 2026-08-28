# Tag rules

Learned rules that attach tags to transactions, stored in `transaction_tag_rules` and served under `/tag-rules`.

## The boundary with corrections

Tag rules and correction rules are separate tables doing separate jobs, and the split is load-bearing rather than incidental:

- **Tag rules drive tagging only.** They never infer entity or transaction type.
- **Correction rules classify.** A correction carrying only tags — no `entityId`, no `transactionType` — is a tag rule in the wrong table. `../corrections/service.ts` guards against it on apply, and `../imports/commit.ts` filters it again, because inside commit's single transaction one such op would roll back an entire import.

A tag rule matches globally when its `entityId` is null, or only within one entity when set.

## Suggestions, never overrides

Three separate paths honour the same rule, and it is the invariant to preserve when touching any of them: **a rule may propose a tag, never replace one a human chose.**

- The preview skips any transaction the caller marks as hand-edited (`userTags` present, empty array included — clearing a row's tags is a decision too).
- Retroactive apply is additive and leaves hand-corrected rows alone; `retroactive-apply.ts` documents exactly how.
- Suggestions carry `source` and `pattern` attribution so the UI can always show where a tag came from.

Everything downstream treats a tag rule's output as a proposal. Nothing in this module writes a tag onto a transaction without that being the explicit point of the call.

## Rejecting a proposal records, it does not revise

`POST /tag-rules/reject` writes the refused ChangeSet and the reason the user gave to `tag_rule_rejections`, and answers with a message. It does not return a replacement.

It used to. The endpoint re-ran `proposeTagRuleChangeSet` against the same signal and returned the result as a "revised" proposal — deterministic in that signal, so byte-identical to the one just refused apart from a sentence of prose, while the UI announced a revision. Tag rules were given the correction side's API shape (propose / reject / follow-up) without the correction side's AI engine behind it. Whether tag rules get an engine, a deterministic narrowing pass, or nothing at all is POPS-253's call; until then the rejection is stored so that decision has evidence to work from, and nothing claims a capability that does not exist.

## The preview is a diff, not a match test

`previewTagRuleChangeSet` runs the production suggester twice per row — once over the persisted rule set, once over that set with the ChangeSet overlaid by `merged-rules.ts` — and reports the difference between the two tag sets.

Running `suggestTags` rather than a private matcher is what stops the panel and the import pipeline from drifting: corrections, entity defaults and every persisted rule sit on both sides of the diff, and `recordTagRuleUsage: false` keeps reading a rule from counting as using it.

It used to hardcode `before` to `[]` and materialize only the ChangeSet's `add` ops, which made it answer a different question — "did this rule match at all". A rule proposing a tag an existing rule already supplied read as full impact on every row; `affected` and `suggestionChanges` were equal by construction; and an `edit`, `disable` or `remove` — the ops where "what am I about to break?" matters most — reported zero. Totals were also taken after the input was truncated to the page size, so "affects N transactions" silently capped at 50 on a 400-row import. `counts` now covers every supplied transaction and only `affected[]` is paged, mirroring `RuleMatchPreviewResult`'s `matches` + uncapped `totalCount` (POPS-2599).

## One matcher, every call site

The same `normalizeDescription` runs when a pattern is written, when a description is matched, and when a preview is computed, and the same predicate — `contract/pattern-match.ts`'s `patternMatchesNormalizedDescription` — decides every verdict. This module used to carry its own copy in a local `pattern-match.ts`; six such copies existed across the pillar and the browser app and disagreed on case folding, digit stripping and the regex `i` flag, so a preview could promise a match production would skip (POPS-2600). `preview.ts`'s header explains why a naive uppercase-only comparison diverges from production.

## Where things live

| Concern                                  | File                                 |
| ---------------------------------------- | ------------------------------------ |
| Propose, atomic apply, rejection record  | `service.ts`                         |
| Deterministic suggestion-impact preview  | `preview.ts`                         |
| ChangeSet overlaid on the persisted set  | `merged-rules.ts`                    |
| Catch-up pass over already-imported rows | `retroactive-apply.ts`               |
| Shared match predicate                   | `../../../contract/pattern-match.ts` |

Each carries a header explaining its own mechanics — including why retroactive apply is idempotent and why a dry run deliberately does not count as rule usage.
