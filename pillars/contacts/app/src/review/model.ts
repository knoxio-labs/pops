import { ContactError } from '../errors';

/** Independent disposition for an existing identity; omission leaves it pending. */
export type CandidateChoice = 'merge' | 'different' | 'later';

/** Evidence displayed for one stored canonical identity. */
export interface ReviewCandidate {
  id: string;
  entityId: string | null;
  localName: string;
  localProfileLabel?: string;
  sourceOptions: {
    id: string;
    name: string;
    label?: string;
    profileLabel?: string;
    active?: boolean;
  }[];
  name: string;
  points: { id: string; kind: string; value: string; persisted?: boolean }[];
  sources: string[];
  hasInactiveSource?: boolean;
  reasons: string[];
  keepSeparate: boolean;
  profileAvailable?: boolean;
}

/** A preview row and its server-computed candidate set at one consistent revision. */
export interface ReviewItem {
  id: string;
  proposalRevision: string;
  recognized?: boolean;
  ingestionAction?: 'create_person' | 'update_source' | 'deactivate_source';
  initialChoices?: Record<string, CandidateChoice>;
  incomingProfileLabel?: string;
  name: string;
  source: string;
  points: { kind: string; value: string }[];
  candidates: ReviewCandidate[];
  candidateTotal: number;
  candidateOffset: number;
  candidateLimit: number;
  visibleCandidateIds?: string[];
  status: string;
  reason?: string;
  errors: string[];
  processed: boolean;
}

/** User selections are scoped to a row; no candidate is selected by default. */
export interface ReviewChoices {
  candidates: Record<string, CandidateChoice>;
  incomingFields?: ('name' | 'personProfile')[];
  nameEntityId?: string;
  profileEntityId?: string;
  nameSourceRecordId?: string;
  profileSourceRecordId?: string;
  preferredPointIds: string[];
}

/** Fresh selections never inherit a previous row's candidates or preferred values. */
export function emptyChoices(): ReviewChoices {
  return { candidates: {}, preferredPointIds: [] };
}

/** Clear preferences owned by a removed candidate while retaining independent choices. */
export function chooseCandidate(
  choices: ReviewChoices,
  candidate: ReviewCandidate,
  choice: CandidateChoice
): ReviewChoices {
  const candidates = { ...choices.candidates, [candidate.id]: choice };
  if (choice === 'merge') return { ...choices, candidates };
  const sourceIds = new Set(candidate.sourceOptions.map((source) => source.id));
  const pointIds = new Set(candidate.points.map((point) => point.id));
  return {
    ...choices,
    candidates,
    incomingFields: Object.values(candidates).includes('merge')
      ? choices.incomingFields
      : undefined,
    nameEntityId: choices.nameEntityId === candidate.id ? undefined : choices.nameEntityId,
    profileEntityId: choices.profileEntityId === candidate.id ? undefined : choices.profileEntityId,
    nameSourceRecordId: sourceIds.has(choices.nameSourceRecordId ?? '')
      ? undefined
      : choices.nameSourceRecordId,
    profileSourceRecordId: sourceIds.has(choices.profileSourceRecordId ?? '')
      ? undefined
      : choices.profileSourceRecordId,
    preferredPointIds: choices.preferredPointIds.filter((id) => !pointIds.has(id)),
  };
}

/** Build explicit independent sets, refusing stale or unknown candidate selections. */
export function selectedCandidates(
  item: ReviewItem,
  choices: ReviewChoices
): { mergeEntityIds: string[]; differentEntityIds: string[]; laterEntityIds: string[] } {
  const mergeEntityIds: string[] = [];
  const differentEntityIds: string[] = [];
  const laterEntityIds: string[] = [];
  for (const [id, choice] of Object.entries(choices.candidates)) {
    const candidate = item.candidates.find((entry) => entry.id === id);
    if (!candidate) throw new ContactError('candidateChanged', 'contacts.review.candidate_changed');
    if (choice === 'later') {
      if (candidate.entityId) laterEntityIds.push(candidate.entityId);
      continue;
    }
    if (!candidate.entityId)
      throw new ContactError('unmaterialized', 'contacts.review.unmaterialized');
    if (choice === 'merge' && candidate.keepSeparate)
      throw new ContactError('keepSeparate', 'contacts.review.keep_separate');
    if (choice === 'merge') mergeEntityIds.push(candidate.entityId);
    if (choice === 'different') differentEntityIds.push(candidate.entityId);
  }
  return { mergeEntityIds, differentEntityIds, laterEntityIds };
}
