/**
 * The rotation services, re-exported whole from the media db barrel.
 *
 * Split out so `db/index.ts` stays under the line cap with room for the next
 * service (POPS-2557); every name keeps its original export.
 */
export type {
  AddToQueueInput,
  CandidateListRow,
  CandidateStatus,
  CandidateStatusResult,
  ListCandidatesInput,
  ListCandidatesResult,
  RotationCandidateRow,
} from './candidates.js';

export * as rotationCandidatesService from './candidates.js';

export type { FetchedCandidate } from './candidate-sync.js';

export * as rotationCandidateSyncService from './candidate-sync.js';

export type { AddExclusionInput, RotationExclusionRow } from './exclusions.js';

export * as rotationExclusionsService from './exclusions.js';

export type {
  CreateSourceInput,
  RotationSourceRow,
  SourceWithCount,
  UpdateSourceInput,
} from './sources.js';

export * as rotationSourcesService from './sources.js';

export * as rotationSettingsService from './settings.js';

export type {
  ListRotationLogResult,
  RotationCycleLog,
  RotationFailedMovieRef,
  RotationLogRow,
  RotationLogStats,
  RotationMovieRef,
} from './rotation-log.js';

export * as rotationLogService from './rotation-log.js';

export type { SelectedCandidate } from './selection-policy.js';

export * as rotationSelectionService from './selection-policy.js';

export type { EligibleMovie, ExpiredMovie, LeavingMovie, MovieSizeMap } from './removal-queries.js';

export * as rotationRemovalQueries from './removal-queries.js';
