# Finance Pillar Audit — 2026-07-05

This report is the merged, adversarially-verified output of two independent multi-agent audit workflows run against latest `main` at commit `f6ca6ac9` (broad-scope pillar audit: 56 agents; rules/matching-engine and live-production-database deep-dive: 33 agents). Every finding below survived cross-checking between the two workflows and, where noted, direct verification against the live `finance.db` snapshot on `capivara`.

## Executive summary

The audit produced **97 findings** (**10 critical**, **23 high**, **43 medium**, **21 low**) and **31 endorsed improvement proposals**, consolidated into a **66-ticket** remediation plan (Appendix). Cross-referencing against the GitHub tracker found only **4 matches** against existing issues/PRs (covering 3 distinct issues: #2619, #3585, #3597) — the overwhelming majority of what this audit surfaces is not currently tracked anywhere. Separately, the audit found **4 issues closed as `COMPLETED`** (#1874, #1873, #1871, #1902) whose claimed work — Up Bank API import, ANZ CSV, ING CSV, and ANZ PDF-statement parsing — provably does not exist in the shipped code (see [Documentation & tracker hygiene](#documentation--tracker-hygiene)).

The single largest concentration of risk is the **import pipeline** (30 of 97 findings), including two money-affecting bugs live in production today (an inverted sign check that misfiles real income/transfers, and a checksum algorithm that lets duplicate bank charges double-count spend) plus a chain of state-loss bugs that silently discard a user's manual corrections. The **live database** independently confirms the worst of these: 62% of entity references are broken, three duplicate transaction pairs are sitting in the ledger right now, and every tag rule in the system is functionally unprioritized.

### Must fix now

- **CF001 — Transfer/income auto-classifier's amount-sign check is inverted** — the guard requires the wrong sign, so real income/transfers are never caught and real expenses are wrongly stripped of entity/tags on essentially every import.
- **CF002 — CSV import always tags every transaction account='Amex' regardless of selected bank** — 3 of the 4 supported banks (ANZ/ING/Up) have every transaction permanently mislabeled `account='Amex'` with no UI signal.
- **CF003 — Inline edit of a rule-matched transaction silently discards the edit and can never change its entity** — the entity dropdown on a rule-matched row is decorative — an edit is silently discarded and redirected into a different dialog.
- **CF004 — Manual review edits silently revert (on pending-ChangeSet reevaluate and on Back-navigation)** — confirmed manual classifications are silently reverted by an unrelated ChangeSet apply or by clicking Back, with no warning.
- **CF005 — Raw-row SHA256 checksum lets duplicate bank charges double-count real spend** — 3 confirmed live duplicate pairs ($78.63) prove real bank charges are being double-counted today.
- **CF006 — Retroactive reclassification bypasses the classification gate — applies uncertain matches and silently clears entities** — an uncertain (0.7–0.89 confidence) rule can silently rewrite unbounded historical transactions and null out correctly-assigned entities ledger-wide, with zero review.
- **CF007 — ChangeSet apply-changeset never persists `priority` on add or edit — drag-to-reorder doesn't stick** — the shipped drag-to-reorder rule-priority feature is a database no-op — the UI lies about what was saved.
- **CF008 — Full raw bank-export row (not a sanitized merchant description) is sent to Claude — PII rule violation** — the full raw bank-export row (any column, including account/reference numbers) is sent to Claude verbatim — a live PII rule violation, not a hypothetical one.
- **CF009 — Entity-reference integrity collapse: 58-62% of finance entity_id references are orphans; active rules perpetuate the split** — 62% of entity-linked transactions reference contacts that no longer exist, and active rules keep writing the dead ids forward on every future import.
- **CF010 — pops-mcp is the only pillar with a host-published port and no inbound auth on /mcp** — the MCP gateway has a published host port and zero inbound authentication — anyone reaching it can call every finance/inventory/media tool with no credentials.

## Live database health (production, capivara)

The most consequential findings in this audit are not code-review observations — they are verified facts about the live `finance.db` on `capivara` (87-row transaction snapshot, `integrity_check=ok`, WAL-checkpointed). The table below is the scorecard; every row traces to a finding id.

| Metric                                                                                    | Value                                    | Finding       |
| ----------------------------------------------------------------------------------------- | ---------------------------------------- | ------------- |
| Total transactions in prod snapshot                                                       | 87                                       | —             |
| Transactions with an entity_id set                                                        | 82/87 (94.3%)                            | —             |
| Entity-linked transactions whose entity_id is orphaned (post-reseed)                      | **51/82 (62.2%)**                        | CF009         |
| Distinct entity_ids referenced across finance tables                                      | 48, of which 28 orphaned (58.3%)         | CF009         |
| Confirmed duplicate transaction pairs (bank-reference match)                              | **3 pairs / 6 rows, $78.63 total**       | CF005         |
| Transfer misclassifications (real expense typed as Transfer, entity stripped)             | 2 (E-TOLL PAYMENT ×2)                    | CF011         |
| `transaction_corrections` rows (all active, avg confidence 0.826)                         | 34                                       | —             |
| Corrections sitting at `priority=0`                                                       | 20/34 (58.8%)                            | CF007         |
| Corrections with `times_applied > 0`                                                      | 1/34                                     | CF020         |
| Corrections below the 0.7 active-match floor (structurally inert)                         | 9 (8 at 0.5, 1 at 0.6)                   | CF021         |
| Corrections with no `entity_id` and no `transaction_type` (tags-only, boundary violation) | 2                                        | CF061         |
| `transaction_tag_rules` rows (all active, avg confidence 0.858)                           | 61                                       | —             |
| Tag rules sitting at `priority=0`                                                         | **61/61 (100%)**                         | CF007 / CF020 |
| Tag rules with `times_applied > 0`                                                        | 0/61                                     | CF020         |
| Tag rules carrying a literal `temp:entity:*` placeholder as `entity_id`                   | 3 (COLES, K MART, PRICELINE)             | CF016         |
| Tag rules referencing an orphaned entity (excl. temp placeholders)                        | 28/61                                    | CF009         |
| Tag rules that structurally never match any live transaction                              | 7/61 (11.5%)                             | CF060         |
| Fully duplicate tag-rule rows                                                             | 3 groups / 6 rows                        | CF060         |
| `tag_vocabulary` total rows / never used                                                  | 65 / **19 (29.2%)**                      | CF091         |
| `ai_usage` rows / total cost / date range                                                 | 164 rows / $0.0527 / 2026-04-07 to 04-14 | —             |
| Litestream processes running on host (of 8 configured)                                    | **0**                                    | CF030         |

**Entity-reference collapse.** The 2026-06-22 entity reseed in the contacts pillar recreated roughly 30 entities under new UUIDs without rewriting the finance side's foreign keys. The result is that 62.2% of entity-linked transactions (51 of 82) — and 28 of 48 distinct entity ids referenced — now point at rows that no longer exist in `contacts.entities`. Several high-volume merchants (Woolworths, Ampol, McDonald's, Hungry Jacks) are split across a dead id and the live id simultaneously, and active correction/tag rules (some at confidence 1.0) keep writing the dead id forward on every future import — the split gets worse over time, not better, until CF009/CP006 lands.

**Duplicate spend.** Three transaction pairs share an identical bank `Reference` number yet were inserted twice, because the dedup checksum hashes the entire raw CSV row (including free-text fields like Address) rather than a canonical identity key — a cosmetic export difference is enough to defeat it (CF005/CP016). Confirmed live pairs: **McDonald's 0344 St Peters** (-$16.50 ×2, 2026-01-24), **Hungry Jacks Woolloomooloo** (-$17.50 ×2, 2026-01-31), and **Bunnings Kingsgrove** (-$44.63 ×2, 2026-02-06) — $78.63 of real spend double-counted across 6 of the 87 live rows.

**Rules are effectively unprioritized and unmeasured.** Every one of the 61 tag rules sits at `priority=0`, and 58.8% of the 34 correction rules do too — the priority field the rule-manager UI exposes and lets users drag-to-reorder (CF007) has never actually taken effect in this database. Usage counters tell the same story from a different angle: only 1 of 34 corrections and 0 of 61 tag rules have ever had `times_applied` incremented (CF020), so there is no signal in the live data to distinguish a load-bearing rule from dead weight. Two independent decay modes compound this: 9 correction rules (8 at exactly 0.5, 1 at 0.6) sit below the 0.7 active-matching floor and structurally can never fire regardless of priority (CF021), while 7 tag rules (11.5%) are built against a normalized entity name that never appears in any raw bank descriptor in the live table and so never match a single transaction (CF060) — two different mechanisms producing the same outcome: rules that look active in the UI and do nothing.

**Suspicious/wrong live rows.** Beyond the 3 confirmed duplicate pairs, the live-DB audit flagged these specific rows as wrong or inconsistent:

- **MCDONALD'S 0344 ST PETERS -16.50 x2 (2026-01-24)** — confirmed duplicate: identical bank Reference AT260260004000010229785 on both rows, only cosmetic Address-field difference caused a different checksum
- **HUNGRY JACKS PTY LTD WOOLLOOMOOLOO -17.50 x2 (2026-01-31)** — confirmed duplicate: identical bank Reference AT260320003000010214494 on both rows
- **BUNNINGS WAREHOUSE KINGSGROVE -44.63 x2 (2026-02-06)** — confirmed duplicate: identical bank Reference AT260370014000010230114 on both rows
- **E-TOLL PAYMENT PARRAMATTA -25.39 x2 (2026-02-04)** — type=Transfer is wrong (should be Expense, a third-party toll charge); entity_id NULL despite a matching 'E-TOLL' entity existing in contacts -- caused by the transfer-classifier's overbroad 'payment' keyword short-circuiting entity matching (these two are NOT duplicates of each other -- different bank Reference numbers, 198255 vs 198249)
- **WW METRO 1130 PARK SYDN ERSKINEVILLE -10.00 (2026-02-01)** — tagged ["Transport","Groceries"] -- 'Transport' is not traceable to any active correction or tag rule for this pattern and looks like a stray/hallucinated tag on an ordinary Woolworths Metro grocery purchase
- **PayID Payment Received, Thank you (+2300, +500, +1700)** — identical description gets 3 different entity_name treatments ('Unknown PayID Sender' / 'PayID' / blank) -- the exact-match correction rule for this description sits at confidence 0.6, below the 0.7 active-matching threshold, so it never fires and behavior falls through inconsistently
- **UNION HOTEL BOTTLESHOP NEWTOWN -8.22 (2026-01-22)** — tags=[] even though it is an alcohol/bottle-shop purchase; the only correction rule matching this merchant itself stores tags=[]
- **DARLO BAR SYDNEY -31.93 (2026-02-04)** — tags=[] while the same-day, same-merchant transaction 6548e896 correctly got ["Alcohol","Bar","Go out"] from the matching tag rule -- inconsistent application of an existing, matching rule

## Findings by severity

### Critical (10)

**CF001 — Transfer/income auto-classifier's amount-sign check is inverted**

- Area: import
- Files: `pillars/finance/src/api/modules/imports/transfer-classifier.ts:15`
- Evidence: isTransferOrIncomeRow() returns false when amount>=0 (line 15), but the app's own sign convention (parseAmount negates, StatsGrid/RecentTransactions treat amount>0=income, <0=expense) means inbound credits are positive and expenses negative — the guard requires the wrong sign.
- Impact: Never catches real inbound transfers/refunds/salary (positive) and wrongly strips entity/tags from negative-amount expenses containing 'payment'/'transfer'/'refund', excluding them from budget totals. Corrupts totals and suggestions on essentially every real import; the shipped imports.test.ts encodes the same inverted assumption.
- Fix: Flip the guard to `if (transaction.amount <= 0) return false;` and add transfer-classifier.test.ts building amounts via the real parseAmount negation.
- Effort: S

**CF002 — CSV import always tags every transaction account='Amex' regardless of selected bank**

- Area: import
- Files: `pillars/finance/app/src/components/imports/column-map/validation.ts:37`; `pillars/finance/app/src/components/imports/processing/useProcessing.ts`; `pillars/finance/app/src/components/imports/ProcessingStep.tsx`
- Evidence: validateRow hardcodes account:'Amex' (validation.ts:37) and useProcessing/ProcessingStep POST account:'Amex' literally, ignoring the store's real bankType (ANZ/Amex/ING/Up). The hardcoded string is persisted verbatim.
- Impact: Every transaction from an ANZ/ING/Up CSV (3 of 4 supported banks) is permanently mislabeled account='Amex'; account filtering/reporting is broken for non-Amex imports with no UI signal.
- Fix: Thread bankType from the store into validateRow and the POST body, replacing both 'Amex' literals; add unit + E2E coverage for a non-Amex import.
- Effort: S

**CF003 — Inline edit of a rule-matched transaction silently discards the edit and can never change its entity**

- Area: import
- Files: `pillars/finance/app/src/components/imports/EditableTransactionCard.tsx:105`; `pillars/finance/app/src/components/imports/hooks/useTransactionEditing.ts`
- Evidence: editedFields never seeds entity and the inline EntitySelect has no onChange, so detectChange is always true for entity'd rows; for any rule-matched txn buildSaveEdit fires generateProposal() and returns before setLocalTransactions, throwing away the user's description/amount/date edits.
- Impact: Editing a rule-matched row silently redirects into the Correction Proposal dialog and loses the edit; the entity dropdown is decorative — entity cannot be changed from the inline card. ReviewStep.test mocks the card entirely (zero coverage).
- Fix: Track entity in editedFields (init from transaction.entity, wire onChange) and fix detectChange to compare only present fields; add a test asserting a new entity persists into onSave.
- Effort: S

**CF004 — Manual review edits silently revert (on pending-ChangeSet reevaluate and on Back-navigation)**

- Area: import
- Files: `pillars/finance/app/src/components/imports/hooks/useTransactionReview.ts:55`; `pillars/finance/src/api/rest/imports-handlers.ts`
- Evidence: Every manual review mutation calls only setLocalTransactions, never setProcessedTransactions/the server session. useReevalOnChangeSets overwrites localTransactions with the stale server snapshot on any ChangeSet apply; and ReviewStep remounts on Back reseeding useState(processedTransactions) with pre-resolution data.
- Impact: After manually resolving uncertain rows, applying an unrelated Correction Proposal — or navigating Back from Tag Review — reverts the user's work with no warning; re-advancing can drop previously-confirmed transactions from the import (data loss) or commit a wrong entity.
- Fix: Reconcile client edits by checksum onto the reevaluate-pending response and on mount (merge confirmedTransactions), or write every local mutation back to the store immediately; add regression tests for both triggers.
- Effort: M

**CF005 — Raw-row SHA256 checksum lets duplicate bank charges double-count real spend**

- Area: import
- Files: `pillars/finance/app/src/components/imports/column-map/validation.ts:40`; `pillars/finance/src/db/services/imports.ts`
- Evidence: checksum = SHA256(JSON.stringify(entireCsvRow)), so two exports of the same transaction that differ only in free-text Address wording get different checksums and both insert. Live DB: 3 pairs share identical bank Reference (McDonald's/Hungry Jacks/Bunnings) yet double-inserted.
- Impact: ~$78.63 of real spend double-counted across 3 confirmed live pairs (6 of 87 rows); the failure recurs for any bank re-export with cosmetic text drift, inflating totals.
- Fix: Compute the identity key from canonical fields (date + amount + normalized description + bank Reference), not the raw row; ship with a migration/reconcile plan since changing the algorithm invalidates all stored checksums.
- Effort: M

**CF006 — Retroactive reclassification bypasses the classification gate — applies uncertain matches and silently clears entities**

- Area: corrections
- Files: `pillars/finance/src/api/modules/imports/reclassify-existing.ts:49`
- Evidence: reclassifyExistingTransactions force-applies any rule match (min 0.7) with no status check, and buildReclassifyUpdates writes entityId (including null) whenever it differs — never routing through classifyCorrectionMatch / handleNoEntityCorrection's 'entity required for purchase' gate that the live-import path was just hardened with.
- Impact: A 0.7-0.89 'uncertain' rule auto-rewrites unbounded historical rows in the same commit that created it, and an over-broad entity-less transfer/income rule can silently null out a correctly-assigned entity across the whole ledger — zero review, unlike imports.
- Fix: Route reclassify's per-transaction decision through the same classifyCorrectionMatch/purchase-needs-entity gate as apply-learned-correction before writing; add tests for the uncertain-skip and no-entity-clear cases.
- Effort: M

**CF007 — ChangeSet apply-changeset never persists `priority` on add or edit — drag-to-reorder doesn't stick**

- Area: corrections
- Files: `pillars/finance/src/api/modules/corrections/service.ts:26`; `pillars/finance/src/contract/corrections-pure.ts`
- Evidence: applyAddOp's insert has no priority field (defaults to 0) and buildEditUpdates never copies op.data.priority; the in-memory applyEditOpInMemory drops it too. The drag-to-reorder feature commits through this path.
- Impact: The rule-manager-priority PRD claims drag-to-reorder is shipped, but the DB commit is a no-op for priority: users reorder, see the optimistic preview, apply, and the DB keeps the old order — every priority-ordered matcher uses stale ordering.
- Fix: Add priority to applyAddOp's insert and to buildEditUpdates (and applyEditOpInMemory); add a round-trip test that applies an edit op with a new priority and re-fetches to assert persistence.
- Effort: S

**CF008 — Full raw bank-export row (not a sanitized merchant description) is sent to Claude — PII rule violation**

- Area: ai
- Files: `pillars/finance/app/src/components/imports/column-map/validation.ts:31`; `pillars/finance/src/api/modules/imports/ai-categorizer.ts`; `pillars/finance/src/api/modules/imports/ai-categorizer-api.ts`
- Evidence: validation.ts:31 sets rawRow=JSON.stringify(row) (whole parsed CSV row); buildPrompt interpolates it as `Transaction data: ${rawRow}`. A sanitizedDescription is computed but used only for logs/telemetry — never the prompt. The module docstrings falsely claim only the merchant description is sent.
- Impact: Any CSV column carrying a card/account number, reference id, or balance is sent to Anthropic verbatim today via the generic importer, directly violating the AGENTS.md PII rule — a live gap, not hypothetical.
- Fix: Build the prompt from the sanitized merchant field (whitelist any needed amount/date), add a test asserting the prompt contains no raw column key outside an allowlist, and rename sanitizedDescription to logDescription.
- Effort: S

**CF009 — Entity-reference integrity collapse: 58-62% of finance entity_id references are orphans; active rules perpetuate the split**

- Area: transactions
- Files: `pillars/finance/src/db/services/imports.ts`; `pillars/finance/src/db/schema/transactions.ts`
- Evidence: 51/82 entity-linked transactions (62%) and 28/48 distinct entity ids reference contacts.entities rows that no longer exist (pre-dating the 2026-06-22 entity reseed that recreated 30 entities with new UUIDs). Same orphan ids are baked into active correction/tag rules (some confidence 1.0), so every future import keeps writing the dead id. Several merchants (Woolworths, Ampol, McDonald's) are split across a dead and a live id.
- Impact: Any per-entity spend rollup, contact transaction list, budget-by-entity, or cross-pillar join silently drops or double-counts the majority of historical data for affected merchants, and worsens over time.
- Fix: One-time backfill: resolve each orphan entity_id to the live contacts id by case-insensitive name match across transactions/corrections/tag_rules; add a nightly/CI reconciliation that fails on any new orphan; have contacts emit an old->new id mapping on reseed.
- Effort: M

**CF010 — pops-mcp is the only pillar with a host-published port and no inbound auth on /mcp**

- Area: mcp
- Files: `pillars/mcp/src/index.ts:77`; `infra/docker-compose.yml`
- Evidence: app.post('/mcp') connects the transport with zero auth middleware (no Authorization/API-key read anywhere in pillars/mcp/src). POPS_API_KEY is used only outbound. docker-compose publishes port 3002 to the host (every other pillar uses internal expose:).
- Impact: Anyone reaching the host on 3002 (LAN, misconfigured firewall, or lateral movement) can call every MCP tool with no credentials — including inventory writes and all finance/media/cerebrum reads — bypassing the mandated Cloudflare Access gate.
- Fix: Add inbound bearer/shared-secret validation to the /mcp route and switch the compose entry from ports: to expose: (route through nginx/Tunnel+Access), or document why a direct host port is required.
- Effort: M

### High (23)

**CF011 — Transfer-classifier's bare 'payment' keyword misclassifies merchant charges as inter-account transfers**

- Area: import
- Files: `pillars/finance/src/api/modules/imports/transfer-classifier.ts:11`
- Evidence: TRANSFER_KEYWORD_PATTERN includes a bare `payment`; 'E-TOLL PAYMENT PARRAMATTA' (x2 live) matches on 'payment' alone, is typed Transfer, and skips entity matching entirely even though an E-TOLL entity exists.
- Impact: Any descriptor containing the generic word 'payment' (card/direct-debit/BPAY/toll payment) is wrongly typed Transfer and never gets an entity, understating expense categorization and orphaning coverage even when the entity record exists.
- Fix: Drop the bare 'payment' keyword or require pairing with a real account-movement signal; add regression tests using real descriptors ('E-TOLL PAYMENT', 'CARD PAYMENT'), validated against a corpus so genuine transfers aren't reclassified as expenses.
- Effort: S

**CF012 — aiFailureCount is never incremented — the AI-failure banner and manual-continue safety gate are dead code**

- Area: import
- Files: `pillars/finance/src/api/modules/imports/process-transaction.ts:76`; `pillars/finance/src/api/modules/imports/processing-helpers.ts`; `pillars/finance/app/src/components/imports/processing/useProcessing.ts`
- Evidence: tryAiCategorization's catch sets only counters.aiError=true; counters.aiFailureCount is never incremented, so buildAiWarnings always returns [] and warnings is always undefined. The wizard's warnings-based pause path can never trigger.
- Impact: When AI categorization is systemically failing (bad key, no credits, persistent 429s) the user gets no aggregate warning and the wizard silently auto-advances past Processing as if fine — the human-in-the-loop valve is unreachable.
- Fix: Increment counters.aiFailureCount++ alongside aiError=true; add a unit test asserting N consecutive AI failures produce a warnings entry with affectedCount===N.
- Effort: S

**CF013 — Progress-store TTL is a fixed cliff from session creation, not refreshed on activity — long imports lose their result**

- Area: import
- Files: `pillars/finance/src/api/modules/imports/progress-store.ts:32`
- Evidence: setProgress arms a single 5-minute setTimeout at creation; updateProgress no-ops if the entry is gone and never re-arms. A batch slow enough (AI retries) to exceed 5 minutes gets deleted mid-flight, so the terminal completed+result write silently no-ops.
- Impact: The FE polling sees the session vanish and never receives the completed result even though the backend finished; the user can't reach Review and must restart, re-incurring AI cost.
- Fix: Re-arm (clearTimeout+setTimeout) the expiry on every updateProgress so the TTL is idle-based, or track lastActivityAt with a periodic sweep.
- Effort: S

**CF014 — Bulk-assignment moveToMatched reintroduces the just-fixed duplicate-matched-card bug (#3590 sibling)**

- Area: import
- Files: `pillars/finance/app/src/components/imports/hooks/bulk-assignment/types.ts:37`
- Evidence: moveOneToMatched was fixed (#3590) to dedupe by checksum, but moveToMatched (used by Accept-All and Create-entity-for-all) still filters by object reference and unconditionally appends to matched with no checksum check.
- Impact: Any bulk path invoked on a transaction already in matched appends a duplicate matched card instead of replacing it; at commit both duplicate-checksum entries hit the unique index and surface as an unexplained failedDetails entry.
- Fix: Extract the checksum-based dedupe/replace-in-place from moveOneToMatched into a shared helper and call it per-transaction in moveToMatched; add a unit test via useAcceptAll/useEntityCreated.
- Effort: S

**CF015 — Manual column-mapping choices are wiped by clicking Back then Next without reselecting a file**

- Area: import
- Files: `pillars/finance/app/src/components/imports/ColumnMapStep.tsx:96`; `pillars/finance/app/src/components/imports/UploadStep.tsx`; `pillars/finance/app/src/store/import-store-actions.ts`
- Evidence: UploadStep's handleNext re-parses the CSV on every click, producing a new headers array; setHeaders/setRows do no content-equality check, so the auto-detect effect re-runs and overwrites both local and store columnMap on remount.
- Impact: A user who manually overrides a mis-detected column then clicks Back and Next has the override silently reverted to the (possibly wrong) auto-detected value; wrong-column data flows through the rest of the import.
- Fix: Make setHeaders/setRows content-aware like setFile, or gate auto-detect to run once per distinct file fingerprint / only when columnMap is empty.
- Effort: S

**CF016 — Unresolved `temp:entity:*` placeholders are persisted as entity_id; non-temp ids aren't validated against contacts**

- Area: import
- Files: `pillars/finance/src/api/modules/imports/commit-temp-resolver.ts:20`; `pillars/finance/src/api/modules/imports/commit-validation.ts`
- Evidence: resolveOpEntityId returns `realId ?? op.data.entityId`, silently keeping the placeholder on a map miss (3 live tag_rules with entity_id='temp:entity:...' for COLES/K MART/PRICELINE). validateCommitPayload also never checks that a non-temp entityId refers to a real contact.
- Impact: The 3 (and any future) temp-leaked rules can never match a real transaction — permanent silent dead weight; combined with unvalidated real ids, malformed/stale ids get written as orphaned references surfacing only later as broken lookups.
- Fix: Throw (roll back the commit) when a referenced temp id has no map entry and reject any entityId matching /^temp:/ before write; validate non-temp ids against the contacts set already fetched; add a cleanup sweep for existing temp:% rows and a regression test.
- Effort: S

**CF017 — Retroactive reclassification has no way to avoid overwriting manually-corrected transactions**

- Area: corrections
- Files: `pillars/finance/src/db/schema/transactions.ts:1`; `pillars/finance/src/api/modules/imports/reclassify-existing.ts`
- Evidence: The transactions table has no manual-override flag (0fa50afd removed the last manuallyEdited remnant); buildReclassifyUpdates overwrites on any diff with no signal distinguishing a hand-corrected row from an auto-matched one.
- Impact: If a user manually fixes a transaction to override a bad rule, the next import's reclassification pass silently reverts it to the rule's answer with no warning or opt-out.
- Fix: Add a manual-override marker set on direct PATCH edits and have buildReclassifyUpdates skip fields the user explicitly set; at minimum document the risk in final-review-commit.md.
- Effort: M

**CF018 — Prose-tolerant JSON parsing (#3591) was applied to only one of five Claude-response parsers**

- Area: corrections
- Files: `pillars/finance/src/api/modules/corrections/ai-analyze.ts:73`; `pillars/finance/src/api/modules/corrections/ai-propose.ts`; `pillars/finance/src/api/modules/corrections/ai-feedback.ts`
- Evidence: extractFirstJsonObject (balanced-brace, prose-tolerant) was added to the categorizer only. parseAnalysis/parseProposals (ai-analyze.ts:73,139), parseReviseResult (ai-propose.ts:168), parseAdaptedSignal (ai-feedback.ts:121) still do naive JSON.parse(stripFences(...)).
- Impact: analyzeCorrection/generateRules/reviseChangeSet/interpretRejectionFeedback are all one stray sentence away from silently returning null/[]/unchanged or throwing a user-visible 'AI returned invalid JSON' — the same root cause already fixed once.
- Fix: Extract extractFirstJsonObject/stripCodeFences into a shared helper and route all five parse sites through it (see proposal CP011 for the strategic tool_use/forced-schema variant).
- Effort: S

**CF019 — Corrections-AI runtime has no rate-limit retry and swallows all errors identically, returning 200 with empty results**

- Area: corrections
- Files: `pillars/finance/src/api/modules/corrections/ai-runtime.ts:70`; `pillars/finance/src/api/rest/corrections-ai-handlers.ts`
- Evidence: defaultCompleter wraps the Anthropic call in a bare try/catch returning null on any failure — no withRateLimitRetry and no typed error code, unlike the categorizer. Callers can't distinguish a 429, missing key, no credits, or 'nothing proposed'.
- Impact: A transient rate limit during rule generation for a large batch silently yields zero proposed rules with a 200 OK; the user concludes the AI found nothing when the call never completed.
- Fix: Route defaultCompleter through the same withRateLimitRetry and surface a typed error (or {failed:true, reason}) instead of collapsing every failure to null.
- Effort: S

**CF020 — Rule usage counters (timesApplied/lastUsedAt) never increment on match; tag-rule priority is inert**

- Area: corrections
- Files: `pillars/finance/src/db/services/transaction-corrections.ts:225`; `pillars/finance/src/db/services/transaction-tag-rules.ts`
- Evidence: incrementTransactionCorrectionUsage is defined but called nowhere in the import pipeline; tag rules have no increment function at all. Live: all 61 tag rules and 33/34 corrections have times_applied=0, and 100% of tag rules sit at priority=0. Both list endpoints ORDER BY confidence DESC, timesApplied DESC, and findMatchingTagRules never reads priority.
- Impact: Any UI/analytics ranking or pruning by 'times applied' sees uniformly zero and falls back to confidence-only; tag-rule priority is exposed and settable but decorative, misleading anyone building on the contract, and there's no way to tell live rules from dead weight.
- Fix: Call an increment-usage function at every real match site (corrections and a new tag-rule equivalent); decide whether tag-rule priority drives ordering or drop it from the contract; add an integration test asserting timesApplied rises after an import applies a rule.
- Effort: M

**CF021 — New rules can be born inert: schema default confidence (0.5) is below the hardcoded matching floor (0.7)**

- Area: corrections
- Files: `pillars/finance/src/db/schema/corrections.ts:22`; `pillars/finance/src/api/modules/imports/process-transaction.ts`
- Evidence: schema default confidence is 0.5 while every matcher enforces a 0.7 floor (duplicated as a literal in 4 files). Live: 8/33 active correction rules sit at exactly 0.5 (is_active=1, times_applied=0) and structurally cannot fire; a further dead rule sits at 0.6 (PayID), producing inconsistent entity-name outcomes.
- Impact: A user or the AI-proposal flow can create a rule the UI shows as active/covering a merchant that will never match a single transaction, silently wasting the review effort and giving false confidence that coverage exists.
- Fix: Raise the schema default to >=0.7, validate confidence>=floor at create/update and on the AI-proposal path, and export a shared MIN_MATCH_CONFIDENCE constant so default/floor/validation can't drift (CP004, CP008).
- Effort: S

**CF022 — Tag-rule normalization is inconsistent across write/match/preview — dead exact rules, case-duplicate rows, preview divergence, raw-vs-normalized regex**

- Area: tag-rules
- Files: `pillars/finance/src/db/services/transaction-tag-rules.ts:82`; `pillars/finance/src/api/modules/tag-rules/preview.ts`; `pillars/finance/src/api/modules/tag-suggester/tag-rule-matching.ts`
- Evidence: createTransactionTagRule stores descriptionPattern verbatim (no normalizeDescription, unlike corrections), so matchType='exact' compares an unnormalized pattern against a normalized description and never fires, and 'K MART'/'k mart' fork into separate rows. preview.ts normalizes with toUpperCase() only vs production normalizeDescription, and the regex branch tests the raw description while exact/contains test the normalized one.
- Impact: Exact tag rules silently never match; the creation preview can disagree with production for any digit-bearing description (most real bank text); duplicate rows fork onto different (including orphaned) entity ids; the first regex tag rule will silently mismatch.
- Fix: Route tag-rule create through normalizeDescription with upsert on (normalized pattern, matchType) like corrections, converge preview.ts and the regex branch onto the shared normalizer, and add tests exercising digit/case variation (CP015, CP030).
- Effort: M

**CF023 — Alias match stage has no minimum-length or longest-wins guard and runs before exact/prefix/contains**

- Area: entity-matching
- Files: `pillars/finance/src/api/modules/imports/entity-matcher.ts:100`
- Evidence: The alias loop returns on the first alias whose key is a substring, with no length floor and no longest-wins comparison (unlike findContainsMatch's 4-char skip + longest tie-break), and it is the first stage evaluated — so a short/generic alias beats even a clean exact-name match.
- Impact: A short or accidentally-broad alias (2-3 chars) can silently capture transactions a longer, more specific match would resolve correctly, with no way to detect it short of re-reading the review UI.
- Fix: Apply the same guards as contains (minimum length / word boundary) and prefer the longest/most-specific matching alias key rather than first-in-iteration-order (CP010).
- Effort: S

**CF024 — AI categorizer entity resolution ignores the alias map the deterministic matcher already has**

- Area: ai
- Files: `pillars/finance/src/api/modules/imports/process-transaction.ts:105`
- Evidence: resolveAiResult only does context.entityLookup.get(name.toLowerCase()) and never consults context.aliases (the same aliasMap the deterministic stage uses), falling straight to buildUncertainFromAi.
- Impact: When Claude returns a string that matches a stored alias rather than the canonical name — a plausible outcome since the model can't see which is canonical — the row is bucketed uncertain even though the deterministic path one stage earlier would have resolved it, making the AI fallback strictly weaker than the primary matcher.
- Fix: Have resolveAiResult fall back to context.aliases.get(name.toLowerCase()) (resolving to canonical, then entityLookup) before bucketing uncertain (CP005).
- Effort: S

**CF025 — Transactions/Budgets/Entities/Wishlist fetch a flat limit:100 batch but present the full server total — older records permanently invisible**

- Area: transactions
- Files: `pillars/finance/app/src/pages/transactions/useTransactionsPage.ts:18`; `pillars/finance/app/src/pages/budgets/useBudgetsPage.ts`; `pillars/finance/app/src/pages/entities/useEntitiesPage.ts`; `pillars/finance/app/src/pages/wishlist/useWishlistPage.ts`
- Evidence: Each page hardcodes {limit:100} with no offset and does all search/filter/sort/pagination client-side over the newest 100 rows, while the subtitle renders the true all-time pagination.total. The server supports offset pagination (Rules Browser already does it correctly).
- Impact: Once a user exceeds 100 records (easy within a year) every older row is invisible to search/filter/edit/delete while the header claims the full count is present — across Transactions, Budgets, Wishlist, and Entities.
- Fix: Wire the DataTable to real server-side pagination (manualPagination + offset/limit/hasMore) following useRulesBrowserModel, or at minimum surface hasMore so the discrepancy is never silent.
- Effort: M

**CF026 — Dashboard 'Active Budgets' widget doesn't filter by active status, contradicting its own PRD**

- Area: dashboard
- Files: `pillars/finance/app/src/pages/DashboardPage.tsx:13`; `pillars/finance/app/src/pages/dashboard/ActiveBudgets.tsx`
- Evidence: BUDGETS_LIST_INPUT={limit:5} passes no active:'true' filter (the contract supports it); the server orders alphabetically by category and the widget slices the first 3, rendering an Active/Inactive badge — so an inactive budget can appear under 'Active Budgets' and a real active budget past position 5 never shows.
- Impact: The headline budgets widget can display retired budgets as current or hide genuinely active ones purely by alphabetical position, misleading the user about what's being tracked.
- Fix: Pass active:'true' (and limit:3 server-filtered), dropping the fetch-5/slice-3 pattern.
- Effort: S

**CF027 — Dashboard headline income/expense/net stats computed from an arbitrary 10-row slice, not a time-boxed aggregate**

- Area: dashboard
- Files: `pillars/finance/app/src/pages/dashboard/StatsGrid.tsx:15`; `pillars/finance/app/src/pages/DashboardPage.tsx`
- Evidence: DashboardPage fetches {limit:10} and computeStats sums income/expenses over whatever 10 most-recent transactions returned; the cards are labelled 'Last 10 transactions' but 10 rows can span a day or months and one outlier skews the figure.
- Impact: The dashboard's primary glanceable numbers change based on transaction count, not time period, so a large 'Net Balance' swing can be unrelated to actual monthly cash flow.
- Fix: Compute these stats server-side or from a date-filtered query (e.g. this month) and label them with the real time window.
- Effort: M

**CF028 — PromptViewerPage shows stale, hand-copied prompt templates that no longer match the real prompts sent to Claude**

- Area: ai
- Files: `pillars/finance/app/src/pages/PromptViewerPage.tsx:13`
- Evidence: The hardcoded PROMPTS array shows the old single-category schema ({entityName,category}) while the live buildPrompt returns {entityName,tags:[...]} with dynamic known-tags and sanitization rules; snake_case rule-gen vs the real camelCase; and it omits buildAnalyzePrompt/buildRevisePrompt/buildInterpretPrompt entirely. Flagged by multiple auditors.
- Impact: A developer/user auditing prompt behavior (e.g. for PII or tags-vs-category) is shown materially wrong, incomplete content — undermining the page's only purpose and risking false confidence about PII handling.
- Fix: Generate the page from the real buildPrompt/build\*Prompt functions (with placeholder inputs) or add a drift/snapshot test; longer-term rebuild from a live prompt registry (CP029) to close #2619 criterion 3.
- Effort: S
- GH match: #2619 (partial)

**CF029 — Up Bank webhook is a documented no-op — verifies signature then only logs, never re-fetches or persists**

- Area: platform
- Files: `pillars/finance/src/api/webhooks/up-bank.ts:55`
- Evidence: AGENTS.md mandates validate-signature-then-refetch-from-Up-API, but the handler verifies the signature then only console.warns the event — no Up API call, no DB write (confirmed by up-bank-api-import.md 'Partial scaffold only'). No GitHub issue tracks the gap. Explains why prod has no ingestion since March (100% Amex, 87 rows, 2026-01..03).
- Impact: The mandated Up ingestion flow doesn't work today; nothing persists so no live exploit, but the code doesn't match the security architecture and a future contributor persisting the body directly would reintroduce the exact risk the rule prevents.
- Fix: Finish the scaffold (fetch by verified transactionId, map+dedupe by checksum, insert) or file the tracked issue and mark the no-op explicitly; add a 'days since last import' ops alert. (Fold the non-constant-time signature compare CF042 into the same hardening.)
- Effort: M

**CF030 — No litestream (or any) replication running on capivara — finance.db has zero verified offsite backup**

- Area: db
- Files: `infra/litestream/finance.yml`
- Evidence: infra/litestream/finance.yml (and configs for every pillar) document S3 replication for /data/sqlite/finance.db, but on the live host docker ps and ps aux show no litestream image/container/process running.
- Impact: If the sqlite-data volume is lost or corrupted there is no S3 replica to restore finance.db (or any pillar db), despite the deployment model assuming litestream is active.
- Fix: Verify with the homelab-infra deployer whether litestream is intentionally off or unwired; if unwired, deploy the sidecar per infra/litestream/\*.yml and confirm a restore drill before treating any pillar db as durable.
- Effort: M

**CF031 — Vite dev proxy has no /contacts-api rule — finance's cross-pillar contacts integration is unreachable in local dev**

- Area: platform
- Files: `pillars/shell/vite.config.ts:90`
- Evidence: server.proxy defines rules for registry/lists/inventory/finance/food/media/cerebrum but never /contacts-api (or /ai-api), while finance hardcodes baseUrl '/contacts-api' and prod nginx does proxy it. A rule was never added after the entities/contacts split.
- Impact: Under pnpm dev/vite (not prod nginx), /contacts-api GETs fall through to the SPA history fallback (HTML not JSON), so the entity picker/entities admin silently breaks; broken ~2 weeks, uncaught because CI never runs a live dev server against contacts-api.
- Fix: Add /contacts-api (and /ai-api) proxy rules mirroring existing entries, and add a check that every <pillar>-api prefix in nginx.conf also exists in vite.config.ts.
- Effort: S

**CF032 — app-finance's generated Hey API client is stale against the committed OpenAPI contract, with no CI gate to catch drift**

- Area: platform
- Files: `pillars/finance/app/src/finance-api/sdk.gen.ts`
- Evidence: finance.openapi.json declares /ai-usage/cache endpoints but sdk.gen.ts has zero ai-usage/AiCache exports. unit-quality.yml's codegen-drift step excludes pillars/\*/app; app-quality.yml runs only typecheck+test; no workflow regenerates+diffs the app-finance client.
- Impact: The FE client can drift arbitrarily from the BE contract with green CI (typecheck passes on the stale-but-consistent file); a caller adding a call to a recent endpoint can't find it and hand-writes a duplicate fetch.
- Fix: Add a codegen-drift step to app-quality.yml running every generate:\* the app declares followed by git diff --exit-code, then regenerate the finance client once to close the gap.
- Effort: M

**CF033 — Finance MCP coverage: 7+ read-only contract surfaces have no tool**

- Area: mcp
- Files: `pillars/mcp/src/tools/finance.ts:172`
- Evidence: financeTools exports only transactionsList/entitiesList/budgetsList, yet transactions.get, budgets.get, corrections.list, tagRules.vocabulary, wishlist.list/get, imports.getImportProgress, and search.search are all read-only GETs addable without touching the read-only rule.
- Impact: An agent can't look up a single transaction/budget by id, inspect corrections, see the wishlist, check import status, or run unified finance search — forcing workarounds or making whole domains invisible to AI tooling.
- Fix: Add the read-only tools following the existing ToolDef pattern.
- Effort: M

### Medium (43)

**ai** (5)

| ID    | Title                                                                                                               | Files                                                                                                                                                        | Effort |
| ----- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| CF036 | AI entity/response cache is fully built and exposed via REST but never populated by production code                 | pillars/finance/src/api/modules/ai-usage-cache.ts<br>pillars/finance/src/api/rest/ai-cache-handlers.ts                                                       | M      |
| CF037 | AI entity matches carry no model-reported confidence and are visually indistinguishable from deterministic matches  | pillars/finance/src/api/modules/imports/ai-categorizer-api.ts<br>pillars/finance/app/src/components/imports/transaction-card/badges.tsx                      | M      |
| CF038 | analyzeCorrection's AI confidence is computed, sent over the wire, then discarded — approval always hardcodes 0.95  | pillars/finance/src/api/modules/corrections/changeset-builders.ts<br>pillars/finance/app/src/components/imports/correction-proposal/useProposalGeneration.ts | S      |
| CF039 | AI categorizer runs per-row sequentially with no batching, budget, or shared circuit-breaker                        | pillars/finance/src/api/modules/imports/process-service.ts                                                                                                   | L      |
| CF062 | Correction/categorizer prompts are zero-shot and blind to the system's own vocabulary — no entity list, no few-shot | pillars/finance/src/api/modules/imports/ai-categorizer-api.ts<br>pillars/finance/src/api/modules/corrections/ai-analyze.ts                                   | M      |

**budgets** (2)

| ID    | Title                                                                                             | Files                                                                                         | Effort |
| ----- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ------ |
| CF043 | Budget amount / wishlist target-saved accept negative values at the contract layer                | pillars/finance/src/contract/rest-budgets.ts<br>pillars/finance/src/contract/rest-wishlist.ts | S      |
| CF047 | Dashboard ActiveBudgets widget omits spent-vs-budget progress — the one thing a budget card needs | pillars/finance/app/src/pages/dashboard/ActiveBudgets.tsx                                     | S      |

**corrections** (6)

| ID    | Title                                                                                                                                      | Files                                                                                                                        | Effort |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- | ------ |
| CF035 | ChangeSet 'add' ops are raw inserts with no upsert/idempotency — duplicate correction and tag rules; commit retries re-run every op        | pillars/finance/src/api/modules/corrections/service.ts<br>pillars/finance/src/db/services/transaction-tag-rules.ts           | M      |
| CF040 | Learned-correction lookup re-queries the full transaction_corrections table per transaction instead of once per run                        | pillars/finance/src/api/modules/imports/apply-learned-correction.ts<br>pillars/finance/src/api/modules/imports/reevaluate.ts | M      |
| CF048 | Frontend re-implements the shared, already-browser-safe normalizeDescription instead of importing it                                       | pillars/finance/app/src/components/imports/lib/normalization.ts                                                              | S      |
| CF059 | Newly-created rules are not retroactively applied to already-imported transactions                                                         | pillars/finance/src/db/services/transactions.ts<br>pillars/finance/src/db/services/transaction-tag-rules.ts                  | M      |
| CF060 | Duplicate/contradictory/unreachable active rules in the live DB                                                                            | pillars/finance/src/db/services/transaction-tag-rules.ts                                                                     | M      |
| CF061 | 2 correction rows carry no entity_id and no transaction_type — tags-only rows that violate the corrections/tag-rule boundary and are inert | pillars/finance/src/db/services/transaction-corrections.ts                                                                   | S      |

**dashboard** (1)

| ID    | Title                                                                                                   | Files                                                                                                        | Effort |
| ----- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------ |
| CF046 | DashboardPage swallows the budgets query error, rendering a false 'No active budgets found' empty state | pillars/finance/app/src/pages/DashboardPage.tsx<br>pillars/finance/app/src/pages/dashboard/ActiveBudgets.tsx | S      |

**db** (2)

| ID    | Title                                                                                                     | Files                                                                               | Effort |
| ----- | --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ------ |
| CF052 | schema.ts exports a `tierOverrides` table with no backing migration — dead schema that crashes if queried | pillars/finance/src/db/schema/tier-overrides.ts<br>pillars/finance/src/db/schema.ts | S      |
| CF057 | No persisted match-provenance on committed transactions                                                   | pillars/finance/src/db/schema/transactions.ts                                       | M      |

**docs** (2)

| ID    | Title                                                                                                                                                         | Files                                                                                              | Effort |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ------ |
| CF074 | AGENTS.md Import-Pipeline/Data-Flow section is factually wrong (v_active_corrections view, fuzzy match, disk+DB AI cache, 'import script', dedup description) | AGENTS.md<br>pillars/finance/docs/README.md                                                        | S      |
| CF075 | Finance README/roadmap/Partial-PRD status drift: overstated import support, 100%-ticked Partial PRDs, unqualified 'Done' roadmap row                          | pillars/finance/docs/README.md<br>pillars/finance/docs/prds/import-wizard-ui.md<br>docs/roadmap.md | M      |

**entity-matching** (2)

| ID    | Title                                                                                  | Files                                                                                                         | Effort |
| ----- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------ |
| CF056 | No diacritic normalization; punctuation-strip retry only handles apostrophes/backticks | pillars/finance/src/api/modules/imports/entity-matcher.ts<br>pillars/finance/src/contract/corrections-pure.ts | M      |
| CF072 | entity-matcher.ts (the core 5-stage ladder) has zero unit tests                        | pillars/finance/src/api/modules/imports/entity-matcher.ts                                                     | M      |

**import** (14)

| ID    | Title                                                                                                                                                 | Files                                                                                                                                                                                                                                         | Effort |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| CF034 | execute-service.ts / POST /imports/execute is a live but dead, divergent write path that bypasses commit's safeguards                                 | pillars/finance/src/api/modules/imports/execute-service.ts<br>pillars/finance/src/api/rest/imports-handlers.ts                                                                                                                                | M      |
| CF049 | eslint-disable suppressions paper over unstable-dependency hook bugs, notably a stale-closure risk in useProcessing                                   | pillars/finance/app/src/components/imports/processing/useProcessing.ts<br>pillars/finance/app/src/components/imports/tag-rule-dialog/useTagRuleProposal.ts                                                                                    | M      |
| CF050 | 'Approve & Commit All' — the import flow's largest irreversible bulk write — has no confirmation and a thin double-submit guard                       | pillars/finance/app/src/components/imports/FinalReviewStep.tsx<br>pillars/finance/app/src/components/imports/hooks/useFinalReview.ts                                                                                                          | S      |
| CF051 | Three near-duplicate 'replace transaction in bucket' implementations plus a dead updateTransaction store action                                       | pillars/finance/app/src/components/imports/hooks/useTransactionEditing.ts<br>pillars/finance/app/src/store/import-store-actions.ts                                                                                                            | S      |
| CF053 | FileUpload's local selectedFile display diverges from the store's actual file after a rejected re-selection                                           | pillars/finance/app/src/components/imports/FileUpload.tsx                                                                                                                                                                                     | S      |
| CF054 | Rule Creation (step 6) has no Back control, breaking the wizard's own 'sequential, can go back' rule                                                  | pillars/finance/app/src/components/imports/RuleCreationStep.tsx                                                                                                                                                                               | S      |
| CF064 | Import wizard hardcodes gray/white Tailwind palette colors instead of design tokens across ~17 files                                                  | pillars/finance/app/src/components/imports/ImportWizard.tsx<br>pillars/finance/app/src/components/imports/transaction-card/CardChrome.tsx                                                                                                     | M      |
| CF065 | Hardcoded amber-\* used for warning/disabled semantics instead of the `warning` token                                                                 | pillars/finance/app/src/components/imports/final-review/op-helpers.tsx                                                                                                                                                                        | S      |
| CF066 | AI-suggestion affordance hardcodes purple instead of the app-accent token, inconsistent within the same component                                     | pillars/finance/app/src/components/imports/transaction-group/GroupHeader.tsx                                                                                                                                                                  | S      |
| CF067 | Several surfaces roll bespoke bare-text empty states instead of reusing @pops/ui's EmptyState/EmptyStateTab                                           | pillars/finance/app/src/pages/rules-browser/sections/RulesTable.tsx<br>pillars/finance/app/src/components/imports/BrowseRulesSidebar.tsx                                                                                                      | S      |
| CF068 | Import pipeline core modules have no dedicated unit tests — only integration coverage via the REST handler                                            | pillars/finance/src/api/modules/imports/**tests**/                                                                                                                                                                                            | M      |
| CF069 | Test-mandate gaps: 0%-covered error formatter, barely-covered reevaluate diff, untested page-model hooks, missing entity-delete E2E                   | pillars/finance/src/api/modules/imports/format-error.ts<br>pillars/finance/src/api/modules/imports/reevaluate-diff.ts<br>pillars/finance/app/src/pages/entities/useEntitiesPage.ts<br>pillars/finance/app/src/pages/budgets/useBudgetsPage.ts | M      |
| CF070 | ColumnMapStep has zero test coverage despite meaningful validation/auto-detect logic                                                                  | pillars/finance/app/src/components/imports/ColumnMapStep.tsx                                                                                                                                                                                  | S      |
| CF076 | local-re-evaluation.ts is dead code and, if revived, ignores rule priority (diverges from every server matcher); plus orphaned tag-rule-learn-helpers | pillars/finance/app/src/lib/local-re-evaluation.ts<br>pillars/finance/app/src/lib/tag-rule-learn-helpers.ts                                                                                                                                   | S      |

**mcp** (2)

| ID    | Title                                                                                              | Files                                 | Effort |
| ----- | -------------------------------------------------------------------------------------------------- | ------------------------------------- | ------ |
| CF071 | finance.entities.list MCP tool has no test coverage for the unavailable/error path                 | pillars/mcp/src/tools/finance.test.ts | S      |
| CF073 | finance.entities.list tool schema omits its own valid `type` enum, silently no-ops invalid filters | pillars/mcp/src/tools/finance.ts      | S      |

**platform** (2)

| ID    | Title                                                                                                               | Files                                            | Effort |
| ----- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | ------ |
| CF042 | Up Bank webhook signature comparison is not constant-time                                                           | pillars/finance/src/api/webhooks/up-bank.ts      | S      |
| CF045 | PillarGuard health routing is a no-op for finance — pillarIdForModule hardcodes every module to the registry pillar | pillars/shell/src/app/pillars/manifest-pillar.ts | S      |

**tag-rules** (1)

| ID    | Title                                                                                    | Files                                                                             | Effort |
| ----- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ------ |
| CF058 | No FE surface to view/edit/disable/delete an existing tag rule — only 'add' is reachable | pillars/finance/app/src/components/imports/tag-rule-dialog/useTagRuleMutations.ts | M      |

**transactions** (3)

| ID    | Title                                                                                                | Files                                                                                                                                          | Effort |
| ----- | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| CF041 | Money is stored and computed as floating-point REAL, not integer cents                               | pillars/finance/src/db/schema/transactions.ts<br>pillars/finance/src/db/schema/budgets.ts<br>pillars/finance/src/api/modules/wishlist-types.ts | L      |
| CF044 | List `limit` query parameter has no upper bound at the contract or MCP layer                         | pillars/finance/src/contract/rest-schemas.ts<br>pillars/mcp/src/tools/finance.ts                                                               | S      |
| CF055 | Transaction Account filter is a hand-maintained hardcoded list with no server-backed source of truth | pillars/finance/app/src/pages/transactions/columns.tsx                                                                                         | S      |

**wishlist** (1)

| ID    | Title                                                                           | Files                                          | Effort |
| ----- | ------------------------------------------------------------------------------- | ---------------------------------------------- | ------ |
| CF063 | WishlistPage rolls its own PageHeader/raw h1 and skips i18n + useSetPageContext | pillars/finance/app/src/pages/WishlistPage.tsx | S      |

### Low (21)

**ai** (3)

| ID    | Title                                                                                                              | Files                                                                                                            | Effort |
| ----- | ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- | ------ |
| CF078 | Minor AI-path issues: category defaulting to '' not null, non-429 retry gap, missing client timeouts               | pillars/finance/src/api/modules/imports/ai-categorizer.ts<br>pillars/finance/src/api/modules/imports/ai-retry.ts | S      |
| CF095 | Rejection feedback only informs the exact (matchType, pattern) key rejected, and only the latest rejection is kept | pillars/finance/src/api/modules/corrections/ai-feedback.ts                                                       | M      |
| CF096 | Suggestion-quality telemetry (accept/reject per prompt version) is not recordable today despite schema support     | pillars/finance/src/api/modules/ai-telemetry-deps.ts                                                             | M      |

**db** (2)

| ID    | Title                                                                                                                                  | Files                                                                                                                                                                                                          | Effort |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| CF083 | Latent perf nits: JSON full-table tag/category scans, leading-wildcard LIKE search, uncached webhook secret, unbounded known-tags scan | pillars/finance/src/db/services/budget-spend.ts<br>pillars/finance/src/db/services/transactions.ts<br>pillars/finance/src/api/webhooks/up-bank.ts<br>pillars/finance/src/api/modules/imports/tag-management.ts | S      |
| CF091 | Prod data-quality observations: empty budgets/settings, null import_batch_id cost rows, 19/65 unused seed tags                         | pillars/finance/src/db/schema.ts                                                                                                                                                                               | S      |

**docs** (1)

| ID    | Title                                                                                                                                               | Files                                                         | Effort |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ------ |
| CF088 | AGENTS.md stale references: deleted .impeccable.md, non-existent PRD folder path, phantom apps/packages, closed-as-COMPLETED issues for undone work | AGENTS.md<br>pillars/finance/docs/ideas/up-bank-api-import.md | S      |

**entity-matching** (3)

| ID    | Title                                                                                                  | Files                                                     | Effort |
| ----- | ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------- | ------ |
| CF092 | Matcher re-normalizes and re-materializes the full entity set on every transaction with no memoization | pillars/finance/src/api/modules/imports/entity-matcher.ts | S      |
| CF093 | Prefix/contains tie-break falls back to an arbitrary alphabetical order, not match quality             | pillars/finance/src/api/modules/imports/entity-matcher.ts | S      |
| CF094 | sanitizeEntityName's all-caps brand allowlist is a small hardcoded set with no extensibility           | pillars/finance/src/api/modules/imports/entity-name.ts    | S      |

**import** (5)

| ID    | Title                                                                                                       | Files                                                                                                                                                                             | Effort |
| ----- | ----------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| CF077 | Deterministic tag rule-creation proposes rules from a group of exactly one confirmed transaction            | pillars/finance/app/src/components/imports/rule-creation/utils.ts                                                                                                                 | S      |
| CF081 | Assorted wizard hygiene: unclamped goToStep, case-sensitive .csv check, stale '7-step' comment              | pillars/finance/app/src/store/import-store-actions.ts<br>pillars/finance/app/src/components/imports/FileUpload.tsx<br>pillars/finance/app/src/components/imports/ImportWizard.tsx | S      |
| CF082 | merged-state.ts memoizes via shared mutable module-level singletons instead of per-caller memoization       | pillars/finance/app/src/lib/merged-state.ts                                                                                                                                       | S      |
| CF090 | text-[10px] arbitrary Tailwind value used 26 times where the existing text-2xs token is the exact same size | pillars/finance/app/src/components/imports/correction-proposal/impact-panel/ImpactContent.tsx                                                                                     | S      |
| CF097 | Minor doc/comment overstatements around commit atomicity and per-transaction error handling                 | pillars/finance/src/api/modules/imports/commit.ts                                                                                                                                 | S      |

**mcp** (3)

| ID    | Title                                                                                                   | Files                                                           | Effort |
| ----- | ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ------ |
| CF085 | Every MCP tool response is pretty-printed JSON, inflating token cost for LLM consumers                  | pillars/mcp/src/tools/utils.ts                                  | S      |
| CF086 | MCP_PORT and inventory's PORT both default to 3002 — collision in local non-Docker dev                  | pillars/mcp/src/index.ts<br>pillars/inventory/src/api/server.ts | S      |
| CF087 | MCP gateway minor ops gaps: no server-side error logging, silent API-key source, enum-vs-boolean filter | pillars/mcp/src/index.ts<br>pillars/mcp/src/pillar-client.ts    | S      |

**platform** (2)

| ID    | Title                                                                                                                           | Files                                                                                                 | Effort |
| ----- | ------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ------ |
| CF079 | Duplicate, unused contract schemas diverge from the live wire contract                                                          | pillars/finance/src/contract/schemas/budget.ts<br>pillars/finance/src/contract/schemas/transaction.ts | S      |
| CF089 | isNotFoundError / isUnavailableError exported but never called; finance/contacts API-helper files are near-identical duplicates | pillars/finance/app/src/finance-api-helpers.ts<br>pillars/finance/app/src/contacts-api-helpers.ts     | M      |

**tag-rules** (1)

| ID    | Title                                                        | Files                                                    | Effort |
| ----- | ------------------------------------------------------------ | -------------------------------------------------------- | ------ |
| CF080 | Doc comment claims a foreign key that migration 0057 removed | pillars/finance/src/db/services/transaction-tag-rules.ts | S      |

**transactions** (1)

| ID    | Title                                                                                                          | Files                                                                                                                                                                                          | Effort |
| ----- | -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| CF084 | Minor polish across finance pages: type-gymnastics, missing aria-label, over-fetch, offset not reset on delete | pillars/finance/app/src/pages/EntitiesPage.tsx<br>pillars/finance/app/src/pages/rules-browser/sections/RulesFilters.tsx<br>pillars/finance/app/src/pages/rules-browser/useRulesBrowserModel.ts | S      |

## Import flow

Import is the pillar's highest-impact surface — 30 of the 97 findings live here, including 6 of the 10 criticals. Read individually the findings look like a grab-bag of unrelated bugs; read together they share one root cause and one through-line.

**The state-loss chain.** Three independent bugs each throw away a user's manual work at a different point in the same wizard. **CF003** shows that inline-editing a rule-matched transaction card never actually saves the edit: `editedFields` doesn't seed the current entity, so the entity `<select>` has no working `onChange` and the save path instead redirects into the Correction Proposal dialog, discarding whatever the user typed. **CF004** is the same failure mode at the review-step level: every manual review mutation writes only to local component state and never back to the store or server, so the moment an unrelated ChangeSet is applied (a routine action later in the same wizard) or the user clicks **Back** to revisit Tag Review, `ReviewStep` remounts from the stale pre-resolution snapshot and silently reverts every resolved row. **CF015** is the same class one step earlier — Back-then-Next on Column Mapping re-parses the CSV and re-runs auto-detect unconditionally, wiping a manual column override the user just made. None of these are edge cases: they trigger on the wizard's own primary navigation (Back) and its own primary confirmation step (apply a proposal), which is exactly what makes them dangerous — the user has no reason to suspect their review work just disappeared.

**Data-correctness bugs baked into every import.** **CF002** hardcodes `account: 'Amex'` in both the row validator and the processing POST body, regardless of which of the four supported banks (ANZ/Amex/ING/Up) the user actually selected in Step 1 — three-quarters of the supported bank matrix is silently mislabeled the moment it lands in the ledger, which is also why the live database shows 100% `account='Amex'` regardless of source. **CF001** and **CF011** are two independent bugs in the same 40-line `transfer-classifier.ts` module: the amount-sign guard is inverted relative to the app's own sign convention (so it never catches a real inbound transfer and wrongly reclassifies real negative-amount expenses), and separately the keyword list includes a bare `'payment'`, which the live database confirms misclassifies an ordinary third-party charge (`E-TOLL PAYMENT PARRAMATTA`, seen twice) as an inter-account Transfer and skips entity matching even though a matching E-TOLL entity exists. **CF005** is the checksum issue detailed above — real duplicate bank charges get separate ids because the hash includes volatile free text. **CF008** is the PII leak: a `sanitizedDescription` is computed correctly but never used — the prompt actually sent to Claude is built from the full raw parsed CSV row, contradicting both the module's own docstring and the AGENTS.md PII rule.

**Operational fragility.** **CF013** shows the progress-store's 5-minute TTL is armed once at session creation and never refreshed on activity, so an import slow enough to need AI retries can have its session deleted mid-flight — the backend finishes but the terminal `completed` write silently no-ops into a dead entry, and the user is stuck restarting (and re-billing AI costs) with no diagnostic. **CF012** shows the safety valve meant to catch systemic AI failure (`aiFailureCount`) is never incremented, so the warning banner and the manual-continue gate are unreachable dead code — a bad API key or a run of 429s produces silent auto-advance instead of a pause. **CF014** is a direct sibling of the just-fixed #3590 duplicate-matched-card bug: the fix was applied to `moveOneToMatched` but not to the `moveToMatched` bulk-assignment path used by Accept-All, so the exact same duplicate-checksum failure mode ships again through a different door.

**Why these shipped.** The through-line across all of the above is testing. **CF068** confirms the import pipeline's core modules (`process-service`, `entity-matcher`, `transfer-classifier`, `progress-store`, `commit*`, `reclassify-existing`, `reevaluate*`) have no dedicated unit tests — only broad REST-handler integration tests, which encode the same wrong assumptions the code does (the shipped `imports.test.ts` bakes in the same inverted sign convention as CF001). The audit's own coverage advisory goes further: the wizard's e2e spec (`pillars/shell/e2e/import-wizard-happy-path.spec.ts`) stubs every backend call via `page.route()`, so it structurally cannot exercise the account-hardcode, back-navigation loss, or dedup-sibling bugs — the mock is the bug's cover, not a safety net (see [Coverage & caveats](#coverage--caveats)).

## Rules, matching & AI — improvement roadmap

Beyond the 97 bug/gap findings, the audit endorsed **31 improvement proposals** for the rules, matching-engine, and AI-suggestion subsystems, grouped into now/next/later by the two workflows' combined priority review.

### Now (6)

These six are cheap (S/M effort), address a live correctness gap, and have no sequencing dependency on anything else in the backlog:

- **CP001 — Harden commit-time temp-entity-id resolution with a fail-loud invariant + repair the 3 known-bad live rows.** resolveOpEntityId silently keeps an unresolved temp:entity:\* placeholder on a map miss (3 dead tag_rules live). Converts a silent, permanent, undiscoverable data-corruption class into a loud, immediately-actionable commit failure and cleans up the live DB.
- **CP002 — Fix priority persistence through the ChangeSet apply path (DB + in-memory) with a round-trip test.** corrections/service.ts applyChangeSet drops priority on add/edit and the in-memory apply has the same gap, so drag-to-reorder never persists. Makes the priority system's flagship drag-to-reorder UX actually work, closing the PRD-vs-code gap.
- **CP003 — Apply the purchase-needs-entity safeguard symmetrically in reclassify-existing.** The just-shipped 'entity required for purchase rule matches' fix only guards the live-import path; reclassify force-applies any winning rule's state including clearing entityId. Closes a live, high-impact asymmetry where a rule change can silently declassify historical transactions.
- **CP004 — Centralize the matching-confidence floor as a shared MIN_MATCH_CONFIDENCE constant.** The 0.7 floor is duplicated as a literal/default in 4 files with no single source of truth (unlike HIGH_CONFIDENCE_THRESHOLD). One place to change the floor safely; removes the drift that let the schema default (0.5) diverge below it.
- **CP005 — Fix AI-categorizer alias-lookup gap.** resolveAiResult only checks the canonical entity-name lookup, never the alias map the deterministic matcher already has in scope. Immediate, low-risk accuracy win for the AI fallback with no prompt/model changes.
- **CP006 — Cross-pillar entity FK reconciliation job.** 58-62% of finance entity_id references point at contacts.entities rows that no longer exist, with merchants split across a dead id and the live id. Restores correctness for per-entity rollups and stops active high-confidence rules perpetuating the split on every import.

| ID    | Title                                                                                                              | Priority | Effort |
| ----- | ------------------------------------------------------------------------------------------------------------------ | -------- | ------ |
| CP001 | Harden commit-time temp-entity-id resolution with a fail-loud invariant + repair the 3 known-bad live rows         | now      | S      |
| CP002 | Fix priority persistence through the ChangeSet apply path (DB + in-memory) with a round-trip test                  | now      | S      |
| CP003 | Apply the purchase-needs-entity safeguard symmetrically in reclassify-existing                                     | now      | M      |
| CP004 | Centralize the matching-confidence floor as a shared MIN_MATCH_CONFIDENCE constant                                 | now      | S      |
| CP005 | Fix AI-categorizer alias-lookup gap                                                                                | now      | S      |
| CP006 | Cross-pillar entity FK reconciliation job                                                                          | now      | M      |
| CP007 | Build a first-class Tag Rules browser mirroring RulesBrowserPage                                                   | next     | M      |
| CP008 | Enforce the match-confidence floor at rule creation time                                                           | next     | S      |
| CP009 | Repair AGENTS.md's Import Pipeline section against the PRDs                                                        | next     | S      |
| CP010 | Give the alias stage the same specificity guards as contains/prefix                                                | next     | S      |
| CP011 | Structured output (tool use / forced JSON schema) for every Claude call in the corrections + categorizer clusters  | next     | M      |
| CP012 | Give the categorizer and analyze-correction a closed-set entity vocabulary + few-shot accepted-correction examples | next     | M      |
| CP013 | Surface AI confidence in the correction-proposal dialog instead of discarding it                                   | next     | S      |
| CP014 | Raise the tag-rule-creation minimum group size above one transaction                                               | next     | S      |
| CP015 | Normalize + upsert-key transaction_tag_rules like transaction_corrections                                          | next     | M      |
| CP016 | Canonical dedup key instead of whole-row checksum                                                                  | next     | M      |
| CP017 | Narrow transfer-classifier keyword set                                                                             | next     | S      |
| CP018 | Rule-conflict detector for duplicate active patterns (read-only report)                                            | next     | M      |
| CP019 | Rule match telemetry: real usage counts and a 'never matched' surfacing                                            | later    | M      |
| CP020 | Full-history dry-run/preview for any rule change                                                                   | later    | M      |
| CP021 | Merchant-normalization dictionary layer for processor noise                                                        | later    | M      |
| CP022 | Fold diacritics and broaden punctuation stripping in the shared normalizer                                         | later    | M      |
| CP023 | Persist match provenance at commit time                                                                            | later    | M      |
| CP024 | Entity-matcher unit tests + (later) offline evaluation harness replaying historical descriptions                   | later    | M      |
| CP025 | Batch the AI categorizer like generate-rules already does                                                          | later    | L      |
| CP026 | Per-import AI circuit breaker (+ optional budget cap)                                                              | later    | M      |
| CP027 | Wire promptVersion telemetry for every finance AI-suggestion surface                                               | later    | M      |
| CP028 | Turn rejection feedback into a real (bounded) negative-example set                                                 | later    | M      |
| CP029 | Rebuild PromptViewerPage from a live prompt registry                                                               | later    | M      |
| CP030 | Align tag-rule regex matching to the normalized description                                                        | later    | S      |
| CP031 | Enforce the classification-rule/tag-rule table boundary at ChangeSet apply time                                    | later    | S      |

## MCP gateway

The finance slice of the MCP gateway (`pillars/mcp`) surfaced one critical security finding and a cluster of coverage/quality gaps.

**CF010 — pops-mcp is the only pillar with a host-published port and no inbound auth on /mcp**

- Area: mcp
- Files: `pillars/mcp/src/index.ts:77`; `infra/docker-compose.yml`
- Evidence: app.post('/mcp') connects the transport with zero auth middleware (no Authorization/API-key read anywhere in pillars/mcp/src). POPS_API_KEY is used only outbound. docker-compose publishes port 3002 to the host (every other pillar uses internal expose:).
- Impact: Anyone reaching the host on 3002 (LAN, misconfigured firewall, or lateral movement) can call every MCP tool with no credentials — including inventory writes and all finance/media/cerebrum reads — bypassing the mandated Cloudflare Access gate.
- Fix: Add inbound bearer/shared-secret validation to the /mcp route and switch the compose entry from ports: to expose: (route through nginx/Tunnel+Access), or document why a direct host port is required.
- Effort: M

**CF033 — Finance MCP coverage: 7+ read-only contract surfaces have no tool**

- Area: mcp
- Files: `pillars/mcp/src/tools/finance.ts:172`
- Evidence: financeTools exports only transactionsList/entitiesList/budgetsList, yet transactions.get, budgets.get, corrections.list, tagRules.vocabulary, wishlist.list/get, imports.getImportProgress, and search.search are all read-only GETs addable without touching the read-only rule.
- Impact: An agent can't look up a single transaction/budget by id, inspect corrections, see the wishlist, check import status, or run unified finance search — forcing workarounds or making whole domains invisible to AI tooling.
- Fix: Add the read-only tools following the existing ToolDef pattern.
- Effort: M

Beyond the critical auth gap (CF010) and the coverage gap (CF033) detailed above under Critical/High, the remaining MCP findings are lower-severity polish, all folded into a single ticket (#64 in the appendix):

| ID    | Title                                                                                                   | Severity | Effort |
| ----- | ------------------------------------------------------------------------------------------------------- | -------- | ------ |
| CF071 | finance.entities.list MCP tool has no test coverage for the unavailable/error path                      | medium   | S      |
| CF073 | finance.entities.list tool schema omits its own valid `type` enum, silently no-ops invalid filters      | medium   | S      |
| CF085 | Every MCP tool response is pretty-printed JSON, inflating token cost for LLM consumers                  | low      | S      |
| CF086 | MCP_PORT and inventory's PORT both default to 3002 — collision in local non-Docker dev                  | low      | S      |
| CF087 | MCP gateway minor ops gaps: no server-side error logging, silent API-key source, enum-vs-boolean filter | low      | S      |

**Coverage gap.** `financeTools` exports only `transactionsList`/`entitiesList`/`budgetsList` (3 of ~30 gateway tools total, versus roughly 18 for inventory). Seven read-only REST surfaces the contract already exposes — single-item `transactions.get`/`budgets.get`, `corrections.list`, `tagRules.vocabulary`, `wishlist.list`/`get`, `imports.getImportProgress`, and unified `search.search` — have no MCP tool at all (CF033), so an agent working through MCP cannot look up a single transaction or budget by id, inspect corrections, see the wishlist, check import status, or run a unified search.

**Auth gap.** `pops-mcp` is the only pillar container that host-publishes its port (3002, via `ports:` in `infra/docker-compose.yml` — every other pillar uses `expose:`), and the `/mcp` route connects the transport with no inbound credential check anywhere in `pillars/mcp/src` (`POPS_API_KEY` is used only outbound). Anyone reaching the host on 3002 — LAN, a misconfigured firewall, or lateral movement — can call every MCP tool across every pillar with zero authentication, bypassing the Cloudflare Access gate AGENTS.md mandates (CF010).

## Documentation & tracker hygiene

**AGENTS.md Import Pipeline drift (flagship: CF074).** AGENTS.md's Import Pipeline/Data-Flow section makes four claims that are simply false against the live code: it says matching is a "fuzzy match against `v_active_corrections`" — no such view exists in the live schema; the real matcher is `findAllMatchingTransactionCorrectionsFromDb`, ordered `priority ASC, id ASC`, doing exact/contains/regex matching, not fuzzy matching. It says the AI fallback is "cached to disk + DB" — the PRD retracted this and no cache runs in production (see CF036). It calls the import flow an "import script" in one paragraph while correctly calling it the 8-step Import Wizard 25 lines later. And its dedup description is stale relative to the actual checksum algorithm (CF005). This is not a minor nit: **5 independent auditors across both workflows flagged the same `v_active_corrections` claim independently**, which is the strongest possible signal that this is the doc drift most likely to actively mislead the next engineer or agent who reads AGENTS.md first, exactly as it's designed to be read.

**PRD/roadmap status drift (CF075).** The finance README's Success Criteria and Out-of-Scope sections claim working Up Bank ingestion and per-bank CSV parsers that are, in reality, scaffold-only or entirely generic (see the tracker problem below). Three of the five PRDs marked `Partial` — `import-wizard-ui`, `rule-manager-priority`, `ai-rule-creation` — have every acceptance-criteria checkbox ticked, which breaks AGENTS.md's own mechanical status rule ("all boxes ticked = Done") and would cause a naive audit to misclassify them as Done, silently losing the gaps the PRD authors candidly documented elsewhere in the same file. `docs/roadmap.md` compounds this by giving finance an unqualified **Done** row despite 5 of its 13 PRDs being Partial.

**Smaller drift.** CF080 — a `transaction_tag_rules.ts` comment claims a schema-level FK on `entity_id` that migration `0057_drop_entities_mirror.sql` removed; no such FK exists today, entity existence is checked only live against contacts. CF088 — AGENTS.md references a deleted file (`.impeccable.md`, removed in `a43f3ade`/#3507), cites a PRD folder path that doesn't exist (`entity-matching-engine/` vs. the real flat `.md` file), and claims "no `apps/`, no `packages/`" though both exist on disk. CF097 — `commit.ts`'s docstring overstates atomicity: it claims full rollback, but `writeTransactionsPhase` swallows per-transaction insert errors rather than rolling back the surrounding `db.transaction`, and the "nothing half-committed" claim ignores that `preCreatePendingContacts` creates entities in the contacts pillar _before_ the finance transaction even opens.

**Tracker hygiene — closed issues for undone work.** The GitHub history shows PRD22 (the multi-bank importer epic) closed with every user story ticked, including US-03 (ANZ CSV), US-04 (ING CSV), US-05 (Up Bank import), and US-07 (ANZ PDF statement parsing). The audit independently confirms, from both static code review and the live database, that none of these actually work: the bank selector is cosmetic and every row is force-mapped through one generic Amex-shaped transform (CF002), and the Up Bank webhook is a documented no-op that verifies a signature and only logs the event (CF029). The 4 issues below were **closed as `COMPLETED`** and need to be reopened or explicitly superseded by a ticket that reflects reality:

| Issue | What was claimed done    | What actually exists                                                                                                                                                                                                |
| ----- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #1874 | Up Bank batch import     | Closed as COMPLETED (Apr 2026, zero comments) but Up Bank batch import is provably unimplemented — up-bank-api-import.md still documents it as an unbuilt scaffold (see CF029/CF088). Re-open or supersede.         |
| #1873 | ING CSV parser           | Closed as COMPLETED but the ING CSV parser doesn't exist — per-bank-parsers.md confirms the bank selector is cosmetic and every row is force-mapped through one Amex transform (CF002/CF088). Re-open or supersede. |
| #1871 | ANZ CSV parser           | Closed as COMPLETED but the ANZ CSV parser doesn't exist (same generic column-mapping-only reality as #1873). Re-open or supersede.                                                                                 |
| #1902 | ANZ PDF statement parser | Closed as COMPLETED but the ANZ PDF statement parser is unimplemented; no code path exists. Re-open or supersede.                                                                                                   |

Two other issues surfaced during matching are **not stale** and should stay open as-is: **#2619** (an open architecture discussion; acceptance criteria 1-2 done, criterion 3 — a live PromptViewer registry — remains, matched by CF028/CP029) and **#3585** (open and valid; its `useTagRuleProposal.ts:93` item is a subset of CF049 and should be absorbed by that ticket). **#3597** (impact-panel full-DB preview) was also matched, by CP020 (partial) — it was closed live during the audit window and needs no action beyond noting the snapshot file used for cross-referencing was 1-2 hours stale.

All 4 GH matches found across the entire finding/proposal set:

| Item  | GH issue | Relation |
| ----- | -------- | -------- |
| CF028 | #2619    | partial  |
| CP029 | #2619    | partial  |
| CF049 | #3585    | partial  |
| CP020 | #3597    | partial  |

## Coverage & caveats

This audit was conducted through static code review, live-database querying, and GitHub history cross-referencing. It was **not** a live-UI or load-driven exercise. The following boundaries, drawn from the workflows' own critical self-review, should inform how much weight each finding class is given:

- **No live-UI walkthrough.** Every FE-side finding (CF003, CF004, CF014, CF015, CF053, CF054, and others) was reached by reading store/component logic, not by driving a running app in a browser. Nothing in this audit confirms these bugs are visible to a real user the way the code review predicts, or screenshots the failure.
- **Import wizard e2e tests are fully mocked.** `pillars/shell/e2e/import-wizard-happy-path.spec.ts` stubs every backend call via `page.route()` with hand-written JSON, so it structurally cannot exercise the account-hardcode (CF002), back-navigation state loss (CF004/CF015), or dedup-sibling (CF014) bugs — the mock is the bug's cover.
- **No real bank CSV corpus in the repo.** `find . -iname "*.csv"` across the whole tree returns zero results. Every dedup/parsing/entity-matching claim was validated against unit fixtures or live prod data, never against an actual ANZ/Amex/ING/Up export with real-world quirks (encoding, header variants, locale number formats).
- **No load or performance testing.** No k6/artillery/autocannon exists anywhere in the monorepo. CF013 (progress-store TTL cliff) and CF039 (sequential per-row AI categorization) are exactly the class of bug that only manifests under a large/slow import; both were found by reading code, not by running one.
- **moltbot's finance skill is a separate, unaudited surface.** `pillars/moltbot/skills/pops-finance/SKILL.md` defines a Telegram-facing, read-only finance integration using a registry-minted service-account key, hitting `/transactions`, `/entity-usage`, `/budgets`, `/wishlist` directly. It claims to strip PII but nothing enforces that on the model side, and it was not audited by either workflow the way the categorizer's PII path (CF008) was.
- **Litestream restore drill never executed.** Beyond confirming no litestream process is running (CF030), nobody has run the documented restore command against a snapshot to confirm it actually works (schema compatibility, permissions, container start/stop ordering).
- **Metabase dashboards untouched.** AGENTS.md lists Metabase as a first-class finance interface, but no dimension inspected Metabase questions/dashboards for correctness against the float-money issue (CF041) or stale entity references (CF009) that would visibly corrupt any chart built on this data.
- **Cross-pillar reconciliation cron reviewed structurally only.** Its existence and shape were reviewed, but it was never actually triggered against the confirmed 62% orphaned-entity live data to observe whether it self-heals, errors, or silently no-ops on that exact condition.
- **AI prompt-injection risk not considered.** Since CF008 confirms the entire raw CSV row is sent verbatim to Claude, no dimension tested what happens if a hostile or malformed merchant-description field contains injection-style content — a distinct risk class from the PII leak already found.
- **Up Bank webhook payload replay never attempted.** CF029 established the webhook is a documented no-op and CF042 that its signature comparison isn't constant-time, but nobody replayed an actual (or sandbox) signed webhook payload through the real handler to confirm both hold under a realistic payload shape.

## Appendix: ticket plan

All 66 planned tickets, in the order proposed by the merge. `Covers` lists the finding ids (`CFxxx`) and/or proposal ids (`CPxxx`) folded into that ticket.

| #   | Kind        | Title                                                                                                                                    | Covers                                                                      |
| --- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| 1   | epic        | epic: Finance-pillar audit remediation tracker                                                                                           | —                                                                           |
| 2   | bug         | fix(finance/import): transfer-classifier amount-sign check is inverted                                                                   | CF001                                                                       |
| 3   | bug         | fix(finance/import): CSV import hardcodes account='Amex' regardless of selected bank                                                     | CF002                                                                       |
| 4   | bug         | fix(finance/import): inline edit of a rule-matched transaction discards the edit and can't change entity                                 | CF003                                                                       |
| 5   | bug         | fix(finance/import): manual review edits silently revert on ChangeSet reevaluate and Back-navigation                                     | CF004                                                                       |
| 6   | bug         | fix(finance/import): raw-row SHA256 checksum lets duplicate bank charges double-count spend                                              | CF005, CP016                                                                |
| 7   | bug         | fix(finance/corrections): reclassify-existing bypasses the classification gate (applies uncertain matches, clears entities)              | CF006, CP003                                                                |
| 8   | bug         | fix(finance/corrections): ChangeSet apply never persists rule priority — drag-to-reorder doesn't stick                                   | CF007, CP002                                                                |
| 9   | bug         | fix(finance/ai): full raw bank-export row is sent to Claude — PII rule violation                                                         | CF008                                                                       |
| 10  | bug         | fix(finance): repair 58-62% orphaned entity_id references + guard against new orphans                                                    | CF009, CP006                                                                |
| 11  | bug         | fix(mcp): add inbound auth to pops-mcp /mcp and stop host-publishing its port                                                            | CF010                                                                       |
| 12  | bug         | fix(finance/import): transfer-classifier bare 'payment' keyword misclassifies merchant charges                                           | CF011, CP017                                                                |
| 13  | bug         | fix(finance/import): increment aiFailureCount so the AI-failure banner and manual-continue gate work                                     | CF012                                                                       |
| 14  | bug         | fix(finance/import): progress-store TTL is a fixed cliff, not idle-based — long imports lose their result                                | CF013                                                                       |
| 15  | bug         | fix(finance/import): bulk moveToMatched appends duplicate matched cards (#3590 sibling)                                                  | CF014                                                                       |
| 16  | bug         | fix(finance/import): manual column-mapping choices wiped by Back-then-Next                                                               | CF015                                                                       |
| 17  | bug         | fix(finance/import): fail-loud on unresolved temp:entity ids + validate non-temp entity ids at commit                                    | CF016, CP001                                                                |
| 18  | bug         | fix(finance/corrections): reclassify can revert manually-corrected transactions — add an override marker                                 | CF017                                                                       |
| 19  | bug         | fix(finance/corrections): route all 5 Claude-response parsers through prose-tolerant JSON extraction                                     | CF018, CP011                                                                |
| 20  | bug         | fix(finance/corrections): corrections-AI runtime needs rate-limit retry and typed errors                                                 | CF019                                                                       |
| 21  | bug         | fix(finance/corrections): rule usage counters never increment; tag-rule priority is inert                                                | CF020, CP019                                                                |
| 22  | bug         | fix(finance/corrections): new rules can be born inert (schema default 0.5 < 0.7 floor)                                                   | CF021, CP004, CP008                                                         |
| 23  | bug         | fix(finance/tag-rules): converge tag-rule normalization (dead exact rules, dup rows, preview/regex divergence)                           | CF022, CP015, CP030                                                         |
| 24  | bug         | fix(finance/entity-matching): add min-length + longest-wins guards to the alias stage                                                    | CF023, CP010                                                                |
| 25  | bug         | fix(finance/ai): AI categorizer should consult the alias map before bucketing uncertain                                                  | CF024, CP005                                                                |
| 26  | bug         | fix(finance): finance list pages fetch limit:100 but show the full total — older records invisible                                       | CF025                                                                       |
| 27  | bug         | fix(finance/dashboard): Active Budgets widget doesn't filter by active status                                                            | CF026                                                                       |
| 28  | bug         | fix(finance/dashboard): headline stats computed from an arbitrary 10-row slice, not a time window                                        | CF027                                                                       |
| 29  | bug         | fix(finance/ai): PromptViewerPage shows stale prompts that don't match what's sent to Claude                                             | CF028, CP029                                                                |
| 30  | bug         | fix(finance/platform): finish or explicitly no-op the Up Bank webhook (+ constant-time signature compare)                                | CF029, CF042                                                                |
| 31  | bug         | fix(infra/finance): no litestream replication running on capivara — finance.db has no verified backup                                    | CF030                                                                       |
| 32  | bug         | fix(shell): add /contacts-api (and /ai-api) Vite dev proxy rule for finance                                                              | CF031                                                                       |
| 33  | bug         | fix(finance): add a codegen-drift CI gate for the app-finance Hey API client                                                             | CF032                                                                       |
| 34  | enhancement | feat(mcp/finance): add the missing read-only finance MCP tools                                                                           | CF033                                                                       |
| 35  | refactor    | refactor(finance/import): remove or fold the dead execute-service write path                                                             | CF034                                                                       |
| 36  | bug         | fix(finance/corrections): make ChangeSet 'add' upsert-keyed + add a commit idempotency key                                               | CF035                                                                       |
| 37  | refactor    | refactor(finance/ai): wire or delete the dead AI entity cache module + its REST endpoints                                                | CF036                                                                       |
| 38  | enhancement | feat(finance/ai): surface AI confidence for categorizer matches and correction proposals                                                 | CF037, CF038, CP013                                                         |
| 39  | enhancement | perf(finance/ai): batch the categorizer + add a shared 429 circuit breaker                                                               | CF039, CP025, CP026                                                         |
| 40  | refactor    | perf(finance/corrections): fetch the correction rule set once per run, not per transaction                                               | CF040                                                                       |
| 41  | refactor    | refactor(finance): store money as integer cents instead of floating-point REAL                                                           | CF041                                                                       |
| 42  | bug         | fix(shell): PillarGuard routes finance health to the registry pillar (no-op)                                                             | CF045                                                                       |
| 43  | bug         | fix(finance/import): add a confirmation + idempotency to 'Approve & Commit All'                                                          | CF050                                                                       |
| 44  | refactor    | refactor(finance/import): consolidate the 3 replace-in-bucket impls onto stable checksum identity                                        | CF051                                                                       |
| 45  | bug         | fix(finance/db): tierOverrides table is exported with no backing migration                                                               | CF052                                                                       |
| 46  | bug         | fix(finance/import): FileUpload display diverges from store file on a rejected re-selection                                              | CF053                                                                       |
| 47  | bug         | fix(finance/import): add a Back control to Rule Creation (step 6)                                                                        | CF054                                                                       |
| 48  | bug         | fix(finance/transactions): source the Account filter options from data, not a hardcoded list                                             | CF055                                                                       |
| 49  | enhancement | fix(finance/entity-matching): fold diacritics + broaden punctuation stripping in the shared normalizer                                   | CF056, CP022                                                                |
| 50  | enhancement | feat(finance): persist match provenance at commit + add entity-matcher unit tests                                                        | CF057, CF072, CP023, CP024                                                  |
| 51  | enhancement | feat(finance): first-class Tag Rules browser (view/edit/disable/delete) + full-history preview                                           | CF058, CP007, CP020                                                         |
| 52  | enhancement | feat(finance/corrections): retroactively apply newly-created/edited rules to existing transactions                                       | CF059                                                                       |
| 53  | enhancement | feat(finance/ai): give categorizer + analyze-correction a closed-set entity vocabulary and few-shot examples                             | CF062, CP012                                                                |
| 54  | bug         | fix(finance/contract): add non-negative + max-limit validation to budgets/wishlist/list schemas                                          | CF043, CF044                                                                |
| 55  | bug         | fix(finance/dashboard): don't swallow the budgets query error + add spent/progress to budget cards                                       | CF046, CF047                                                                |
| 56  | refactor    | refactor(finance): import the shared normalizeDescription instead of the duplicate FE copy                                               | CF048                                                                       |
| 57  | refactor    | refactor(finance): retire the 4 eslint-disable suppressions (fix the stale-closure hook bug)                                             | CF049                                                                       |
| 58  | refactor    | refactor(finance): delete dead local-re-evaluation module (or fix its priority divergence if revived)                                    | CF076                                                                       |
| 59  | chore       | test(finance): close import-pipeline + page-model + entity-matcher + MCP test-coverage gaps                                              | CF068, CF069, CF070, CF071, CF072                                           |
| 60  | chore       | chore(finance): tag-rule / correction data hygiene — dedupe, boundary, unreachable rows                                                  | CF060, CF061, CP018, CP031                                                  |
| 61  | docs        | docs: correct AGENTS.md Import-Pipeline / Data-Flow inaccuracies                                                                         | CF074, CP009                                                                |
| 62  | drift-check | drift-check(import-wizard-ui, rule-manager-priority, ai-rule-creation) — finance status/README/roadmap doc-drift                         | CF075, CF080, CF088, CF097                                                  |
| 63  | chore       | chore(finance): design-system conformance sweep (tokens, empty states, arbitrary values, WishlistPage header/i18n)                       | CF063, CF064, CF065, CF066, CF067, CF090                                    |
| 64  | chore       | chore(mcp): finance MCP gateway polish (type enum, compact JSON, port default, logging)                                                  | CF073, CF085, CF086, CF087                                                  |
| 65  | chore       | chore(finance): low-priority polish + latent perf batch                                                                                  | CF078, CF079, CF081, CF082, CF083, CF084, CF089, CF091, CF092, CF093, CF094 |
| 66  | enhancement | feat(finance/ai): suggestion-learning backlog (promptVersion telemetry, negative-example set, merchant-noise dictionary, min group size) | CF077, CF095, CF096, CP014, CP021, CP027, CP028                             |
