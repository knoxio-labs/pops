# Tag rules

Learned rules that attach tags to transactions, stored in `transaction_tag_rules` and served under `/tag-rules`.

## The boundary with corrections

Tag rules and correction rules are separate tables doing separate jobs, and the split is load-bearing rather than incidental:

- **Tag rules drive tagging only.** They never infer entity or transaction type.
- **Correction rules classify.** A correction carrying only tags — no `entityId`, no `transactionType` — is a tag rule in the wrong table, and `../corrections/` rejects that shape at both propose and commit.

A tag rule matches globally when its `entityId` is null, or only within one entity when set.

## Suggestions, never overrides

Three separate paths honour the same rule, and it is the invariant to preserve when touching any of them: **a rule may propose a tag, never replace one a human chose.**

- The preview skips any transaction carrying user tags in the current import.
- Retroactive apply merges additively and skips transactions marked `manual`, the hand-fix marker.
- Suggestions carry `source` and `pattern` attribution so the UI can always show where a tag came from.

Everything downstream treats a tag rule's output as a proposal. Nothing in this module writes a tag onto a transaction without that being the explicit point of the call.

## One normalization, three call sites

The same `normalizeDescription` runs when a pattern is written, when a description is matched, and when a preview is computed. This is not tidiness — a preview that normalized differently from production would show a rule matching something it would not actually match, for any description containing digits, which is most real bank text. `pattern-match.ts` exists so the preview and retroactive-apply paths cannot drift on what "matches" means.

## Where things live

| Concern                                  | File                   |
| ---------------------------------------- | ---------------------- |
| Propose and atomic apply                 | `service.ts`           |
| Deterministic suggestion-impact preview  | `preview.ts`           |
| Catch-up pass over already-imported rows | `retroactive-apply.ts` |
| Shared match predicate                   | `pattern-match.ts`     |

Each carries a header explaining its own mechanics — including why retroactive apply is idempotent and why a dry run deliberately does not count as rule usage.
