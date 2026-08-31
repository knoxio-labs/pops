/**
 * Zod building blocks for the `rotation.*` REST contract.
 *
 * Split from `rest-rotation.ts` so the route map stays focused. Zod-only — no
 * imports from `src/api/` or `src/db/`, honouring the package boundary. Covers
 * the data plane; the scheduler surface lives in `rest-rotation-scheduler.ts`.
 */
import { z } from 'zod';

export const CandidateStatusEnum = z.enum(['pending', 'added', 'skipped', 'excluded']);

export const AddToQueueBody = z.object({
  tmdbId: z.number().int().positive(),
  title: z.string().min(1),
  year: z.number().int().optional(),
  rating: z.number().optional(),
  posterPath: z.string().optional(),
});

export const CandidateStatusResultSchema = z.object({
  inQueue: z.boolean(),
  candidateId: z.number().nullable(),
  candidateStatus: z.string().nullable(),
  isExcluded: z.boolean(),
});

export const CandidateListItemSchema = z.object({
  id: z.number(),
  sourceId: z.number(),
  tmdbId: z.number(),
  title: z.string(),
  year: z.number().nullable(),
  rating: z.number().nullable(),
  posterPath: z.string().nullable(),
  status: z.string(),
  discoveredAt: z.string(),
  sourceName: z.string().nullable(),
  sourcePriority: z.number().nullable(),
});

export const ListCandidatesQuery = z.object({
  status: CandidateStatusEnum.optional(),
  search: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

export const ListCandidatesResultSchema = z.object({
  items: z.array(CandidateListItemSchema),
  total: z.number(),
});

export const DownloadCandidateResultSchema = z.object({
  success: z.boolean(),
  alreadyInRadarr: z.boolean(),
});

export const AddExclusionBody = z.object({
  tmdbId: z.number().int().positive(),
  reason: z.string().optional(),
});

export const ExclusionSchema = z.object({
  id: z.number(),
  tmdbId: z.number(),
  title: z.string(),
  reason: z.string().nullable(),
  excludedAt: z.string(),
});

export const ListExclusionsQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

export const ListExclusionsResultSchema = z.object({
  items: z.array(ExclusionSchema),
  total: z.number(),
});

export const SourceSchema = z.object({
  id: z.number(),
  type: z.string(),
  name: z.string(),
  priority: z.number(),
  enabled: z.boolean(),
  config: z.record(z.string(), z.unknown()),
  lastSyncedAt: z.string().nullable(),
  syncIntervalHours: z.number(),
  createdAt: z.string(),
  candidateCount: z.number(),
});

export const CreateSourceBody = z.object({
  type: z.string().min(1),
  name: z.string().min(1),
  priority: z.number().int().min(1).max(10).optional(),
  enabled: z.boolean().optional(),
  config: z.record(z.string(), z.unknown()).optional(),
  syncIntervalHours: z.number().int().min(1).optional(),
});

export const UpdateSourceBody = z.object({
  name: z.string().min(1).optional(),
  priority: z.number().int().min(1).max(10).optional(),
  enabled: z.boolean().optional(),
  config: z.record(z.string(), z.unknown()).optional(),
  syncIntervalHours: z.number().int().min(1).optional(),
});

export const CreatedSourceSchema = SourceSchema.omit({ candidateCount: true });

export const SyncSourceResultSchema = z.object({
  sourceId: z.number(),
  sourceType: z.string(),
  candidatesFetched: z.number(),
  candidatesInserted: z.number(),
  candidatesSkipped: z.number(),
});

export const SourceTypesSchema = z.object({ types: z.array(z.string()) });

export const PlexFriendSchema = z.object({
  uuid: z.string(),
  username: z.string().nullable(),
  displayName: z.string().nullable(),
  avatar: z.string().nullable(),
});

export const PlexFriendsResultSchema = z.object({
  friends: z.array(PlexFriendSchema),
  error: z.string().nullable(),
});

export const SettingsSchema = z.object({
  enabled: z.string(),
  cronExpression: z.string(),
  targetFreeGb: z.string(),
  leavingDays: z.string(),
  dailyAdditions: z.string(),
  avgMovieGb: z.string(),
  protectedDays: z.string(),
  ageExponent: z.string(),
  ratingSpread: z.string(),
  keepUnwatched: z.string(),
  keepExponent: z.string(),
  graceDays: z.string(),
});

/**
 * Bounds for the removal-pressure sliders, shared by the save body and the
 * preview's query overrides so the two can never disagree about what is a
 * legal value.
 *
 * They are ranges rather than a free number because each one has a degenerate
 * end: an age exponent of 0 makes every movie the same age, a rating spread
 * below 1 inverts the ranking so the best-rated go first, and a keep weight of
 * 0 divides by zero.
 */
export const TUNING_BOUNDS = {
  ageExponent: { min: 0.5, max: 3, step: 0.05 },
  ratingSpread: { min: 1, max: 10, step: 0.25 },
  keepUnwatched: { min: 0.25, max: 6, step: 0.25 },
  keepExponent: { min: 0.5, max: 3, step: 0.05 },
  graceDays: { min: 0, max: 90, step: 1 },
} as const;

function tuned(name: keyof typeof TUNING_BOUNDS): z.ZodNumber {
  return z.number().min(TUNING_BOUNDS[name].min).max(TUNING_BOUNDS[name].max);
}

export const SaveSettingsBody = z.object({
  enabled: z.boolean().optional(),
  cronExpression: z.string().min(1).optional(),
  targetFreeGb: z.number().min(0).optional(),
  leavingDays: z.number().int().min(1).optional(),
  dailyAdditions: z.number().int().min(1).optional(),
  avgMovieGb: z.number().gt(0).optional(),
  protectedDays: z.number().int().min(0).optional(),
  ageExponent: tuned('ageExponent').optional(),
  ratingSpread: tuned('ratingSpread').optional(),
  keepUnwatched: tuned('keepUnwatched').optional(),
  keepExponent: tuned('keepExponent').optional(),
  graceDays: tuned('graceDays').int().optional(),
});

/**
 * Unsaved slider values for the preview. Coerced because they arrive as query
 * string values, and every one is optional: an omitted knob falls back to what
 * is stored, so the preview of an untouched form matches the real next cycle.
 */
export const RemovalPreviewQuery = z.object({
  ageExponent: z.coerce.number().pipe(tuned('ageExponent')).optional(),
  ratingSpread: z.coerce.number().pipe(tuned('ratingSpread')).optional(),
  keepUnwatched: z.coerce.number().pipe(tuned('keepUnwatched')).optional(),
  keepExponent: z.coerce.number().pipe(tuned('keepExponent')).optional(),
  graceDays: z.coerce.number().pipe(tuned('graceDays').int()).optional(),
  topCount: z.coerce.number().int().min(1).max(50).optional(),
});

export const SaveSettingsResultSchema = z.object({
  success: z.boolean(),
  updated: z.number(),
});
