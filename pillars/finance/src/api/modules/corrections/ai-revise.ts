/**
 * `reviseChangeSet`: a free-text instruction plus the ChangeSet on screen →
 * a revised ChangeSet for the user to approve. Ported from the monolith
 * `core/corrections/handlers/ai-revise.ts`, split back out of `ai-propose.ts`
 * to stay under the per-file line cap.
 *
 * The prompt states the pattern-storage contract for the match types in play
 * rather than restating one rule for all three — see
 * {@link describePatternStorageRule} — and a returned `add` op is checked
 * against the transactions the correction was raised from before it is
 * offered for approval (POPS-3000).
 */
import {
  describeForMatching,
  describePatternStorageRule,
  patternMatchesDescription,
} from '../../../contract/pattern-match.js';
import { ChangeSetSchema, type ChangeSet } from '../../../contract/rest-corrections.js';
import { transactionCorrections, type FinanceDb } from '../../../db/index.js';
import { extractJsonFromReply } from '../ai-json.js';
import { getClaudeCompleter } from './ai-runtime.js';
import { buildTargetRulesMap, type Correction, type CorrectionSignal } from './ai-types.js';

export interface ReviseArgs {
  signal: CorrectionSignal;
  currentChangeSet: ChangeSet;
  instruction: string;
  triggeringTransactions: { checksum?: string; description: string }[];
}

export interface ReviseResult {
  changeSet: ChangeSet;
  rationale: string;
  targetRules: Record<string, Correction>;
}

/**
 * The storage rule for every match type this revision could plausibly touch —
 * the signal's, plus every `add` op already in the ChangeSet. Deduplicated by
 * the rendered sentence, since `exact` and `contains` share one.
 */
function patternStorageRules(args: ReviseArgs): string {
  const rules = new Set<string>([describePatternStorageRule(args.signal.matchType)]);
  for (const op of args.currentChangeSet.ops) {
    if (op.op === 'add') rules.add(describePatternStorageRule(op.data.matchType));
  }
  return [...rules].join('\n');
}

export function buildRevisePrompt(args: ReviseArgs, sanitizedInstruction: string): string {
  const triggeringLines = args.triggeringTransactions
    .slice(0, 100)
    .map((t, i) => `${i + 1}. "${t.description}"`)
    .join('\n');
  return `You are refining a bundled correction-rule ChangeSet for a personal finance app.

A ChangeSet is { "source"?: string, "reason"?: string, "ops": Op[] } with at least one op. Each op is one of:
- { "op": "add", "data": { "descriptionPattern": string, "matchType": "exact"|"contains"|"regex", "entityId"?, "entityName"?, "location"?, "tags"?, "transactionType"?, "confidence"?, "isActive"? } }
- { "op": "edit", "id": string, "data": { same fields, all optional, no descriptionPattern/matchType } }
- { "op": "disable", "id": string }
- { "op": "remove", "id": string }
Preserve existing ids on edit/disable/remove; do not invent ids.
How a pattern must be written depends on its matchType:
${patternStorageRules(args)}

originalSignal: ${JSON.stringify(args.signal)}

triggeringTransactions:
${triggeringLines || '(none provided)'}

currentChangeSet:
${JSON.stringify(args.currentChangeSet, null, 2)}

instruction: ${JSON.stringify(sanitizedInstruction)}

Return ONLY: {"changeSet": <revised ChangeSet>, "rationale": "<one-line explanation>"}`;
}

function parseReviseResult(text: string): { changeSet: ChangeSet; rationale: string } {
  const jsonSlice = extractJsonFromReply(text);
  if (jsonSlice === null) {
    throw new Error('reviseChangeSet: AI returned no JSON object');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonSlice);
  } catch (cause) {
    throw new Error('reviseChangeSet: AI returned invalid JSON', { cause });
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('reviseChangeSet: AI response was not a JSON object');
  }
  const container = parsed as Record<string, unknown>;
  const changeSet = ChangeSetSchema.safeParse(container['changeSet']);
  if (!changeSet.success) {
    throw new Error('reviseChangeSet: AI returned a ChangeSet that failed schema validation');
  }
  const rationaleRaw = container['rationale'];
  const rationale =
    typeof rationaleRaw === 'string' && rationaleRaw.trim().length > 0
      ? rationaleRaw.trim()
      : 'ChangeSet revised by AI helper';
  return { changeSet: changeSet.data, rationale };
}

/**
 * Refuse a revision carrying an `add` op that cannot fire against any of the
 * transactions the correction was raised from — the check
 * `analyzeCorrection` already runs on its own output, which the schema
 * validation in {@link parseReviseResult} cannot do: a corrupted pattern like
 * `\D{}` is a perfectly well-formed string and a perfectly valid regular
 * expression, and only matching reveals that it is inert.
 *
 * The revision fails rather than dropping the op. A revision is one
 * interactive edit of a small ChangeSet the user is about to approve, so a
 * silently dropped op would present them a ChangeSet that does not do what
 * they asked, and dropping the sole op leaves a set `ChangeSetSchema` rejects
 * anyway. The import-commit path drops instead (`dropUnusableAddOps` in
 * `service.ts`) because there a whole batch of transactions rides on the same
 * db transaction; here nothing is at stake but the revision itself, so the
 * user is told and can re-instruct.
 *
 * Skipped when the caller supplied no triggering transactions: there is then
 * nothing to check against, and failing every such revision would be a worse
 * bug than the one this guards.
 */
function assertRevisedAddOpsCanFire(changeSet: ChangeSet, args: ReviseArgs): void {
  if (args.triggeringTransactions.length === 0) return;
  const descriptors = args.triggeringTransactions.map((t) => describeForMatching(t.description));
  for (const op of changeSet.ops) {
    if (op.op !== 'add') continue;
    const fires = descriptors.some((descriptor) =>
      patternMatchesDescription(op.data.descriptionPattern, op.data.matchType, descriptor)
    );
    if (!fires) {
      throw new Error(
        `reviseChangeSet: AI returned an add op whose ${op.data.matchType} pattern ` +
          `${JSON.stringify(op.data.descriptionPattern)} matches none of the triggering transactions`
      );
    }
  }
}

/** Revise `currentChangeSet` per a free-text instruction, keeping every `add` op able to fire. */
export async function reviseChangeSet(db: FinanceDb, args: ReviseArgs): Promise<ReviseResult> {
  const rulesBefore = db.select().from(transactionCorrections).all();
  const sanitizedInstruction = args.instruction.trim().slice(0, 2000);
  if (sanitizedInstruction.length === 0)
    throw new Error('reviseChangeSet: instruction must be non-empty');

  const text = await getClaudeCompleter()({
    prompt: buildRevisePrompt(args, sanitizedInstruction),
    maxTokens: 2000,
    operation: 'revise-changeset',
  });
  if (!text) throw new Error('reviseChangeSet: AI unavailable');

  const { changeSet, rationale } = parseReviseResult(text);
  assertRevisedAddOpsCanFire(changeSet, args);
  return { changeSet, rationale, targetRules: buildTargetRulesMap(changeSet, rulesBefore) };
}
