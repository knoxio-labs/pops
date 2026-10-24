import { ContactError } from '../errors';

import type {
  ImportReview,
  PersonName,
  ReviewCandidate as CandidateDto,
  ReviewRow,
} from '../contacts-api/types.gen';
import type { ReviewSnapshot } from './contracts';
import type { CandidateChoice, ReviewCandidate, ReviewItem } from './model';

function fullName(name: PersonName): string {
  return [name.namePrefix, name.givenName, name.additionalNames, name.familyName, name.nameSuffix]
    .filter(Boolean)
    .join(' ');
}

function candidateId(candidate: CandidateDto): string {
  if (candidate.entityId) return candidate.entityId;
  if (candidate.rowId) return `row:${candidate.rowId}`;
  throw new ContactError('invalidEvidence', 'contacts.review.invalid_evidence');
}

function mapCandidate(candidate: CandidateDto): ReviewCandidate {
  return {
    id: candidateId(candidate),
    entityId: candidate.entityId ?? null,
    name: candidate.name,
    localName: candidate.localName,
    localProfileLabel: candidate.localPersonProfile
      ? fullName(candidate.localPersonProfile.name)
      : undefined,
    profileAvailable:
      candidate.localPersonProfile != null &&
      fullName(candidate.localPersonProfile.name).length > 0,
    keepSeparate: candidate.keepSeparate,
    points: candidate.points.map((point) => ({
      id: point.id ?? `${point.kind}:${point.value}`,
      kind: point.kind,
      value: point.value,
      persisted: point.id != null,
    })),
    sources: candidate.sources.map((source) =>
      [source.label ?? source.provider, source.displayName ?? fullName(source.name)]
        .filter(Boolean)
        .join(' · ')
    ),
    sourceOptions: candidate.sources.flatMap((source) =>
      source.id
        ? [
            {
              id: source.id,
              name: source.displayName ?? fullName(source.name),
              label: source.label ?? source.provider,
              active: source.active,
              profileLabel: fullName(source.name) || undefined,
            },
          ]
        : []
    ),
    reasons: candidate.reasons,
    hasInactiveSource: candidate.sources.some((source) => !source.active),
  };
}

function ingestionAction(proposal: ReviewRow['proposal']): ReviewItem['ingestionAction'] {
  if (proposal === 'deactivate_source') return 'deactivate_source';
  if (proposal === 'update_source') return 'update_source';
  return 'create_person';
}

function mapRow(row: ReviewRow, source: ImportReview['source']): ReviewItem {
  const candidates = row.candidates.map(mapCandidate);
  const initialChoices: Record<string, CandidateChoice> = {};
  for (const candidate of candidates) {
    const decision = row.decisions[candidate.id];
    if (decision === 'different' || decision === 'later') initialChoices[candidate.id] = decision;
  }
  return {
    id: row.rowId,
    proposalRevision: row.proposalRevision,
    recognized: row.proposal !== 'new_source',
    ingestionAction: ingestionAction(row.proposal),
    name: row.incoming?.displayName ?? (row.incoming ? fullName(row.incoming.name) : ''),
    source: source.label ?? source.provider,
    status: `classifications.${row.classification}`,
    reason: row.reason,
    errors: row.staleSource ? [...row.errors, 'stale_source'] : row.errors,
    processed: row.processed,
    points: row.incoming?.points.map((point) => ({ kind: point.kind, value: point.value })) ?? [],
    candidates,
    candidateTotal: row.candidateTotal,
    candidateOffset: row.candidateOffset,
    candidateLimit: row.candidateLimit,
    initialChoices,
  };
}

/** Map server classifications and original evidence without performing any client-side identity matching. */
export function mapReview(review: ImportReview): ReviewSnapshot {
  return {
    proposalRevision: review.proposalRevision,
    totalRows: review.totalRows,
    offset: review.offset,
    limit: review.limit,
    counts: review.counts,
    batchId: review.batchId,
    batchRevision: review.batchRevision,
    directoryRevision: review.directoryRevision,
    items: review.rows.map((row) => mapRow(row, review.source)),
  };
}
