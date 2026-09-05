# Correction rules

Learned classification rules — the top rung of the import ladder — plus the engine that proposes them from a user's correction. Rules live in `transaction_corrections` and are served under `/corrections`. This module owns no routes of its own; the contract is `contract/rest-corrections.ts`.

## The lifecycle nothing else states

A correction during import review becomes a **ChangeSet** — a bundle of `add` / `edit` / `disable` / `remove` ops approved or rejected as one unit. Even the simplest correction is a ChangeSet of one. The path from click to persisted rule crosses three places:

1. **Propose** — the triggering signal goes to `ai-propose.ts`, which returns a bundled ChangeSet with a DB-scanned impact preview, adapted to the latest prior rejection for that pattern.
2. **Review** — the user edits ops, previews impact, or asks for an AI revision. An AI-revised ChangeSet is **never** auto-applied.
3. **Apply** — and here is the part that surprises people: Apply does **not** write to SQLite. It pushes the ChangeSet into the frontend's pending store, re-evaluates the remaining import rows against the merged rule set, and moves newly-matched rows. Every pending ChangeSet is persisted together, atomically, at **import commit** (`../imports/commit.ts`).

So a rule only exists after the import it was born in is committed. Abandoning the import discards it.

## Rules that span files

- **The baseline is always merged.** Previews and re-evaluation compute over DB rules _plus_ pending ChangeSets, never DB alone — otherwise a second correction in the same session would be previewed against a world that no longer matches what the user sees. What the pillar and the frontend genuinely share is ChangeSet _application_: `pure.ts` delegates that to the contract. The **matchers are duplicated** — `pure.ts` holds the pillar's, and the frontend keeps its own mirror whose header admits as much. Those two can drift, and a change to either must be made to both.
- **Classification rules and tag rules are different tables with a hard boundary.** An `add` op carrying only tags — no `entityId`, no `transactionType` — is a tag rule wearing the wrong hat. It is rejected here, and filtered again at commit, because inside commit's single transaction one such op would roll back an entire import. See `../tag-rules/`.
- **`entity_id` is the operative field; `entity_name` is only a label.** The id alone decides which merchant a firing rule assigns — `buildEntityMatch` falls back to `'Unknown'` for the name. A row carrying a name with no resolvable id therefore _reads_ everywhere as assigning a merchant and applies none, silently. The ChangeSet detail editor writes the pair together through `EntityField` rather than taking a free-text name, and classifies an id-less name as `unresolved` so the editor can surface it. Stored rows predating that, or whose entity was later deleted in `contacts`, can still be in the state.
- **The account scope is opt-in, and it outranks every other ordering key.** A rule carries an optional `account_id`; `null` means it matches on every account, which is what every pre-POPS-2593 row is and what every proposal surface still emits. A scoped rule is invisible to other accounts and beats an unscoped one on the same description regardless of `priority` or `confidence` — scoping is a deliberate operator act, and if it merely joined the heuristic ordering keys a global rule with a lower priority number would silently outrank the rule written to overrule it. `contract/corrections-scope.ts` holds the one predicate and the one comparator both the DB and in-memory matchers use. The scope also joins the create/upsert identity `(pattern, matchType, accountId)`: keyed on the pattern alone, creating a scoped rule beside a global one would reinforce the global one instead. A matcher call with `accountId: null` means the CALLER has no account (a description-only probe) and sees every rule.
- **Type-only rules are terminal, but only for transfer and income.** A transfer/income rule with no entity classifies a matching row with no merchant and counts toward the affected count. A `purchase` rule with no entity is never terminal — review still demands a merchant, so a matching row buckets `uncertain` no matter how confident the rule is.
- **An AI-proposed pattern must actually occur in the description.** `ai-analyze.ts` runs the model's pattern back through `contract/pattern-match.ts`'s `patternMatchesDescription` — the one predicate, so the verification agrees with what the rule will match at apply time — and returns null on a miss, so the caller falls back to a computed pattern. It used to carry a private copy that tested a `regex` pattern against the digit-stripped description, rejecting every digit-dependent regex the model proposed (POPS-2707). Without this the model invents patterns from the entity name when that name never appears in the row — "MEMBERSHIP FEE" assigned to American Express must keep `MEMBERSHIP FEE`.
- **Rejection feedback is a latest-per-key overwrite, not a log.** Re-rejecting the same pattern clobbers the previous message. It steers the next proposal; it is not history, and it cannot answer "what did we propose last Tuesday".
- **Inputs are bounded** so a preview cannot become a full-table scan by accident: ChangeSet previews take at most 2000 transactions and 200 pending ChangeSets, with list limits of 200 and 500.

## Where things live

| Concern                                        | File                                       |
| ---------------------------------------------- | ------------------------------------------ |
| Atomic apply, op ordering, the tags-only guard | `service.ts`                               |
| Pure matchers and shared ChangeSet application | `pure.ts`                                  |
| Deterministic impact computation               | `changeset-impact.ts`, `preview-impact.ts` |
| AI propose / revise / analyze / feedback       | `ai-*.ts`                                  |

Each carries a header comment covering its own mechanics.

## Absent

There is no durable, queryable audit trail of proposal attempts and outcomes (POPS-33). The only persisted artefact is the latest rejection per pattern; approved proposals leave behind nothing but the resulting rule rows, and server logs are the only record of what was proposed and why.
