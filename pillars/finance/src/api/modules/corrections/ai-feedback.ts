import { ChangeSetSchema, type ChangeSet } from '../../../contract/rest-corrections.js';
/**
 * Rejection-feedback persistence + AI interpretation. The store keys are
 * dynamic (`corrections.changeSetRejections:<matchType>:<pattern>`) and live in
 * finance's LOCAL settings store, reached in-process via the injectable
 * `FeedbackStore` (`ai-runtime.ts`).
 * Ported from the monolith `core/corrections/handlers/ai-inference.ts`.
 */
import { type FinanceDb, transactionCorrectionsService } from '../../../db/index.js';
import { extractJsonFromReply } from '../ai-json.js';
import { ClaudeCompletionError, getClaudeCompleter, getFeedbackStore } from './ai-runtime.js';
import {
  AdaptedSignalSchema,
  ChangeSetImpactSummarySchema,
  type CorrectionSignal,
} from './ai-types.js';

import type { ChangeSetImpactSummary } from './ai-types.js';

const { normalizeDescription } = transactionCorrectionsService;

export interface RejectedChangeSetFeedbackRecord {
  createdAt: string;
  userEmail: string;
  feedback: string;
  changeSet: ChangeSet;
  impactSummary: ChangeSetImpactSummary | null;
}

export function feedbackKey(args: {
  matchType: 'exact' | 'contains' | 'regex';
  normalizedPattern: string;
}): string {
  return `corrections.changeSetRejections:${args.matchType}:${args.normalizedPattern}`;
}

function parseFeedbackRecord(value: string): RejectedChangeSetFeedbackRecord | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const obj = parsed as Record<string, unknown>;
  if (
    typeof obj['createdAt'] !== 'string' ||
    typeof obj['userEmail'] !== 'string' ||
    typeof obj['feedback'] !== 'string'
  ) {
    return null;
  }
  const changeSet = ChangeSetSchema.safeParse(obj['changeSet']);
  if (!changeSet.success) return null;
  const impact = ChangeSetImpactSummarySchema.safeParse(obj['impactSummary']);
  return {
    createdAt: obj['createdAt'],
    userEmail: obj['userEmail'],
    feedback: obj['feedback'],
    changeSet: changeSet.data,
    impactSummary: impact.success ? impact.data : null,
  };
}

export async function loadLatestRejectedFeedback(
  db: FinanceDb,
  args: {
    matchType: 'exact' | 'contains' | 'regex';
    normalizedPattern: string;
  }
): Promise<RejectedChangeSetFeedbackRecord | null> {
  const raw = await getFeedbackStore().load(db, feedbackKey(args));
  return raw ? parseFeedbackRecord(raw) : null;
}

export async function persistRejectedChangeSetFeedback(
  db: FinanceDb,
  args: {
    signal: CorrectionSignal;
    changeSet: ChangeSet;
    feedback: string;
    impactSummary: ChangeSetImpactSummary | null;
    userEmail: string;
  }
): Promise<void> {
  const normalizedPattern = normalizeDescription(args.signal.descriptionPattern);
  const record: RejectedChangeSetFeedbackRecord = {
    createdAt: new Date().toISOString(),
    userEmail: args.userEmail,
    feedback: args.feedback,
    changeSet: args.changeSet,
    impactSummary: args.impactSummary,
  };
  await getFeedbackStore().persist(
    db,
    feedbackKey({ matchType: args.signal.matchType, normalizedPattern }),
    JSON.stringify(record)
  );
}

function buildInterpretPrompt(
  originalSignal: CorrectionSignal,
  rejectedChangeSet: ChangeSet,
  sanitizedFeedback: string
): string {
  return `You are improving a transaction correction rule proposal.

Return an adapted signal (JSON only) as {"adaptedSignal": { ... }} with keys descriptionPattern, matchType, entityId, entityName, location, tags, transactionType. Keep descriptionPattern semantically the same unless the feedback explicitly asks to change it; prefer changing matchType when the feedback indicates specificity.

originalSignal: ${JSON.stringify(originalSignal)}
rejectedChangeSet: ${JSON.stringify(rejectedChangeSet)}
feedback: ${JSON.stringify(sanitizedFeedback)}`;
}

function parseAdaptedSignal(text: string, originalSignal: CorrectionSignal): CorrectionSignal {
  const jsonSlice = extractJsonFromReply(text);
  if (jsonSlice === null) return originalSignal;
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonSlice);
  } catch {
    return originalSignal;
  }
  if (!parsed || typeof parsed !== 'object') return originalSignal;
  const adapted = AdaptedSignalSchema.safeParse(
    (parsed as Record<string, unknown>)['adaptedSignal']
  );
  return adapted.success ? adapted.data : originalSignal;
}

/**
 * Adapts the signal from prior rejection feedback — a best-effort refinement
 * of `proposeChangeSetFromCorrectionSignal`, not its primary output. A
 * genuine Claude call failure here (rate limit exhausted, API error) degrades
 * to the original signal rather than failing the whole propose flow, mirroring
 * the existing "no text back" degrade below.
 */
export async function interpretRejectionFeedback(
  originalSignal: CorrectionSignal,
  rejectedChangeSet: ChangeSet,
  feedback: string
): Promise<CorrectionSignal> {
  let text: string | null;
  try {
    text = await getClaudeCompleter()({
      prompt: buildInterpretPrompt(
        originalSignal,
        rejectedChangeSet,
        feedback.trim().slice(0, 500)
      ),
      maxTokens: 250,
      operation: 'rejection-interpret',
    });
  } catch (error) {
    if (error instanceof ClaudeCompletionError) return originalSignal;
    throw error;
  }
  if (!text) return originalSignal;
  return parseAdaptedSignal(text, originalSignal);
}
