# Finance ADR-006: Tag rules match descriptors, and the import wizard proposes only what nothing covers

## Status

Accepted — 2026-09-12.

## Context

POPS-253 asked for a rethink of how tag rules are created, understood and maintained. Working through the import wizard's two rule-authoring steps turned up four questions that needed an answer before any of it could be fixed:

- **What a tag rule may match on.** Every verdict comes from one predicate, `patternMatchesDescription` in `pillars/finance/src/contract/pattern-match.ts`, tested against the bank descriptor. `entity_id` only narrows which rules are eligible, and `description_pattern` has been `NOT NULL` since the table was created. Tag Review's group dialog nonetheless seeded the pattern with the merchant's display name (POPS-255), so a merchant whose name is not a substring of its descriptor got a rule that could never fire. POPS-2940 counts 43 of them. Some groups share no descriptor text at all, which raised the real question: how should "tag everything from this merchant" be expressed?
- **What committing a rule does to one the user disabled.** `createOrReinforceTransactionTagRule` in `pillars/finance/src/db/services/transaction-tag-rules-write.ts` merges an `add` into an existing rule with the same identity and sets it active. An import proposing a rule identical to a disabled one therefore switched it back on, and Final Review called that a merge.
- **What the Rules step (step 6) may pre-tick.** It proposed a rule for every tag common to a merchant's rows, including tags a stored rule or the merchant's default tags had just supplied, and pre-ticked any proposal two rows backed (POPS-3676). A row count carries no judgement about whether a tag belongs to the merchant, and most tags reaching the step are suggestions Tag Review accepted by default.
- **What a rejected proposal should do.** `POST /tag-rules/reject` records the refused ChangeSet and the user's reason in `tag_rule_rejections`, and nothing reads that table (POPS-3046). The tag-rules module README left whether anything should revise from it to POPS-253.

## Options considered

### Tagging every transaction from a merchant

| Option                                                   | Pros                                                                                                                                                                                | Cons                                                                                                                                 |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| An entity-only tag rule: no pattern, or a new match type | One place authors every automatic tag                                                                                                                                               | Needs a migration off `NOT NULL`, a matcher branch, contract and write-guard changes, and duplicates a mechanism that already exists |
| Always require a typed pattern                           | No new mechanism                                                                                                                                                                    | A merchant with varied descriptors has no pattern worth storing, so the user is pushed into one that over- or under-matches          |
| **The merchant's default tags — chosen**                 | Already built: edited on the entity form (`pillars/finance/app/src/pages/entities/EntityFormDialog.tsx`) and applied by the suggester to every row of that merchant on every import | Two places hold tags that apply automatically, so the dialog has to point from one to the other                                      |

A rule stating both an entity and a pattern needed no option of its own: a rule with `entityId` set already fires only within that entity.

### A staged rule that lands on a disabled one

| Option                                           | Pros                                                    | Cons                                                          |
| ------------------------------------------------ | ------------------------------------------------------- | ------------------------------------------------------------- |
| Keep re-enabling, rename the badge               | Smallest change                                         | Re-enabling stays the default, decided by nobody              |
| Never re-enable, and drop the proposal           | A disabled rule stays disabled                          | Someone who wants the rule back has to find it in the browser |
| **Say so and require an explicit tick — chosen** | Nothing re-enables unless someone chose it knowing that | The collision check has to report whether the rule is active  |

### What the Rules step pre-ticks

| Option                                       | Pros                                                                  | Cons                                                                           |
| -------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Keep "backed by more than one row"           | No behaviour change                                                   | Two rows in one statement pre-tick a rule; the count carries no judgement      |
| Only tags added by hand, on two or more rows | Closer to a human decision                                            | A tag a person put on a row is not a statement that it is true of the merchant |
| **Nothing — chosen**                         | Matches finance ADR-004: acceptance is what turns a guess into a rule | One tick per rule worth keeping                                                |

### What a rejection does

| Option                                                  | Pros                                 | Cons                                            |
| ------------------------------------------------------- | ------------------------------------ | ----------------------------------------------- |
| Remove the reject path, so Cancel is the refusal        | Less surface                         | Throws away evidence POPS-3673 can use          |
| Feed rejections to the categorizer as negative examples | Rejections change future suggestions | A build that overlaps POPS-3673, not a decision |
| **Record only — chosen**                                | No change, and the evidence is kept  | A rejection changes nothing on its own          |

## Decision

1. **A tag rule always matches the descriptor, and tagging every transaction from a merchant is the merchant's default tags.** Tag Review seeds a group's pattern from what its descriptors share, using `derivePatternFromDescriptions` in `pillars/finance/src/contract/pattern-derivation.ts`, the derivation the Rules step and the POPS-2940 repair pass already use. When the descriptors share nothing specific enough, the pattern opens empty and the dialog points at the merchant's default tags rather than guessing.
2. **A staged rule that lands on a disabled rule re-enables it only when someone ticked it knowing that.** The Rules step and Final Review both name it as a re-enable, never as a merge.
3. **The Rules step pre-ticks nothing, and is a subtraction.** A tag a stored rule or the merchant's default tags supplied does not count towards a proposal, a tag a rule staged on Tag Review already covers on every source row is dropped, and when nothing is left the wizard passes over the step in both directions. The step's own earlier choices are the one thing it restores.
4. **A rejection is recorded, and nothing revises a proposal from it.**

## Consequences

- Tag Review and the Rules step compare staged rules by the rows they were derived from, never by pattern: the two derive over different row sets and would otherwise stage one merchant's rule twice (POPS-3674).
- Rules already stored with an entity-name pattern are not rewritten here; repairing them is POPS-2940.
- POPS-3046's question is answered by decision 4.
- The rest of POPS-253 is not decided by this ADR, and each part is tracked: a tag's source is unreachable past three tags in Tag Review (POPS-252), whether the tags page and the rules page should be one surface is a design experiment (POPS-3690), and overlapping or contradicting rules are invisible in the rules browser (POPS-3691).

## Related

- POPS-253, the rethink these decisions come from
- POPS-255, POPS-3674 and POPS-3676, which implement them
- Finance ADR-004, rules are instructions and provenance decides review
