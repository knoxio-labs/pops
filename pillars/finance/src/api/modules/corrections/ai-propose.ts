/**
 * `proposeChangeSet`: signal → add/edit ChangeSet + DB-scanned impact,
 * adapting to prior rejection feedback. Ported from the monolith
 * `core/corrections/handlers/compute-changeset.ts`. The free-text revision
 * half lives in `ai-revise.ts`.
 *
 * A signal with no `entityId`/`transactionType` and non-empty `tags` never
 * reaches `buildAddChangeSet` — `proposeChangeSetFromCorrectionSignal` rejects
 * it with a `ValidationError` first, so a tags-only/entityName-only add op is
 * never returned for the user to approve (CF061/#3650; the commit path
 * degrades the same shape instead of rejecting it — see `commit.ts`).
 */
import { and, eq } from 'drizzle-orm';

import { type ChangeSet } from '../../../contract/rest-corrections.js';
import {
  type FinanceDb,
  transactionCorrections,
  transactionCorrectionsService,
} from '../../../db/index.js';
import { ValidationError } from '../../shared/errors.js';
import { interpretRejectionFeedback, loadLatestRejectedFeedback } from './ai-feedback.js';
import { buildTargetRulesMap, type ChangeSetProposal, type CorrectionSignal } from './ai-types.js';
import { buildAddChangeSet, buildEditChangeSet } from './changeset-builders.js';
import { computeChangeSetImpact } from './changeset-impact.js';
import { type CorrectionRow } from './types.js';

const { isTagsOnlyCorrectionInput, normalizeDescription, normalizePatternForStorage } =
  transactionCorrectionsService;

interface FeedbackInfo {
  changeSet: ChangeSet;
  feedback: string;
}

async function resolveEffectiveSignal(
  db: FinanceDb,
  signal: CorrectionSignal
): Promise<{ effectiveSignal: CorrectionSignal; feedback: FeedbackInfo | null }> {
  const latest = await loadLatestRejectedFeedback(db, {
    matchType: signal.matchType,
    normalizedPattern: normalizeDescription(signal.descriptionPattern),
  });
  if (!latest) return { effectiveSignal: signal, feedback: null };
  const effectiveSignal = await interpretRejectionFeedback(
    signal,
    latest.changeSet,
    latest.feedback
  );
  return { effectiveSignal, feedback: { changeSet: latest.changeSet, feedback: latest.feedback } };
}

function findExistingRule(
  db: FinanceDb,
  matchType: 'exact' | 'contains' | 'regex',
  normalizedPattern: string
): CorrectionRow | undefined {
  return db
    .select()
    .from(transactionCorrections)
    .where(
      and(
        eq(transactionCorrections.matchType, matchType),
        eq(transactionCorrections.descriptionPattern, normalizedPattern)
      )
    )
    .get();
}

function describeRationale(
  existing: CorrectionRow | undefined,
  matchType: string,
  normalizedPattern: string,
  feedback: FeedbackInfo | null
): string {
  const base = existing
    ? `Edit correction rule ${existing.id} (${matchType}:${normalizedPattern}) based on correction signal`
    : `Add new correction rule (${matchType}:${normalizedPattern}) based on correction signal`;
  return feedback ? `${base}. Follow-up after rejection feedback: "${feedback.feedback}"` : base;
}

export interface ProposeArgs {
  signal: CorrectionSignal;
  minConfidence: number;
  maxPreviewItems: number;
}

export async function proposeChangeSetFromCorrectionSignal(
  db: FinanceDb,
  args: ProposeArgs
): Promise<ChangeSetProposal> {
  const { effectiveSignal, feedback } = await resolveEffectiveSignal(db, args.signal);
  const matchType = effectiveSignal.matchType;
  const normalizedPattern = normalizePatternForStorage(
    effectiveSignal.descriptionPattern,
    matchType
  );
  const existing = findExistingRule(db, matchType, normalizedPattern);

  if (!existing && isTagsOnlyCorrectionInput(effectiveSignal)) {
    throw new ValidationError(
      'A correction signal needs an entityId or a transactionType — tags-only signals belong in transaction_tag_rules'
    );
  }

  const builderArgs = {
    effectiveSignal,
    normalizedPattern,
    matchType,
    hasFeedback: feedback !== null,
    feedback: feedback?.feedback,
  };
  const changeSet = existing
    ? buildEditChangeSet(existing, builderArgs)
    : buildAddChangeSet(builderArgs);

  const impact = computeChangeSetImpact(db, {
    changeSet,
    matchType,
    normalizedPattern,
    minConfidence: args.minConfidence,
    maxPreviewItems: args.maxPreviewItems,
  });

  return {
    changeSet,
    rationale: describeRationale(existing, matchType, normalizedPattern, feedback),
    preview: { counts: impact.counts, affected: impact.affected },
    targetRules: buildTargetRulesMap(changeSet, impact.rulesBefore),
  };
}
