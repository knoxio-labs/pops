/**
 * useRotationTuning — drives the `rotation-tuning` settings widget.
 *
 * The sliders are local state, not server state: the whole point is to see
 * what an unsaved value would do before committing to it, so every edit
 * re-queries the preview with the pending values as query overrides and only
 * `save` writes anything. A form nobody has touched sends no overrides at all,
 * so its preview is exactly what the next real cycle would do.
 *
 * The preview is debounced because dragging a slider fires a value per frame
 * and each preview costs a Radarr round-trip on the server.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { unwrap } from '../../media-api-helpers.js';
import {
  rotationGetSettings,
  rotationSaveSettings,
  rotationSchedulerRemovalPreview,
  rotationSchedulerResetQueue,
} from '../../media-api/index.js';

import type {
  RotationGetSettingsResponse,
  RotationSchedulerRemovalPreviewResponse,
} from '../../media-api/index.js';

export const PREVIEW_DEBOUNCE_MS = 300;

/** Matches `TUNING_BOUNDS` in the media contract. */
export const TUNING_FIELDS = [
  {
    key: 'ageExponent',
    default: 1.2,
    label: 'Age acceleration',
    min: 0.5,
    max: 3,
    step: 0.05,
    hint: 'How much faster pressure builds as a film sits unwatched. 1 is linear.',
  },
  {
    key: 'ratingSpread',
    default: 3,
    label: 'Rating influence',
    min: 1,
    max: 10,
    step: 0.25,
    hint: 'How much a good rating slows ageing, and a bad one speeds it. 1 ignores ratings.',
  },
  {
    key: 'keepUnwatched',
    default: 2.5,
    label: 'Unwatched protection',
    min: 0.25,
    max: 6,
    step: 0.25,
    hint: 'How much longer a film you have never watched is kept. Above 1 protects it.',
  },
  {
    key: 'keepExponent',
    default: 1.4,
    label: 'Rewatch protection',
    min: 0.5,
    max: 3,
    step: 0.05,
    hint: 'How quickly rewatching earns protection. Watched once is always the least protected.',
  },
  {
    key: 'graceDays',
    default: 30,
    label: 'Grace period (days)',
    min: 0,
    max: 90,
    step: 1,
    hint: 'A film downloaded this recently is never removed, whatever it scores.',
  },
] as const;

export type TuningKey = (typeof TUNING_FIELDS)[number]['key'];

export type TuningValues = Record<TuningKey, number>;

type RotationSettings = RotationGetSettingsResponse['data'];

type PreviewPayload = RotationSchedulerRemovalPreviewResponse['data'];

/** One row of the ranked preview, plus whether the pending batch reaches it. */
export type PreviewMovie = NonNullable<PreviewPayload['plan']>['topRanked'][number] & {
  inNextBatch: boolean;
};

const SETTINGS_QUERY_KEY = ['media', 'rotation', 'settings'] as const;
const PREVIEW_QUERY_KEY = ['media', 'rotation', 'removal-preview'] as const;

function toNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function useDebounced<T>(value: T, delayMs: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return settled;
}

export interface RotationTuningModel {
  values: TuningValues | null;
  isDirty: boolean;
  setValue: (key: TuningKey, value: number) => void;
  reset: () => void;
  save: () => void;
  isSaving: boolean;
  saveError: string | null;
  preview: PreviewState;
  resetQueue: () => void;
  isResettingQueue: boolean;
  clearedCount: number | null;
}

export interface PreviewState {
  isLoading: boolean;
  isStale: boolean;
  error: string | null;
  skippedReason: string | null;
  movies: PreviewMovie[];
  removableCount: number;
  eligibleCount: number;
  markedNow: number;
}

/** The stored values, as numbers, or null until the settings have loaded. */
function storedValues(settings: RotationSettings | undefined): TuningValues | null {
  if (!settings) return null;
  const out = {} as TuningValues;
  for (const field of TUNING_FIELDS) {
    out[field.key] = toNumber(settings[field.key], field.default);
  }
  return out;
}

interface PreviewQueryLike {
  data: PreviewPayload | undefined;
  isLoading: boolean;
  error: Error | null;
}

const EMPTY_PLAN = {
  toMark: [],
  topRanked: [],
  removableCount: 0,
  eligibleCount: 0,
} satisfies Pick<
  NonNullable<PreviewPayload['plan']>,
  'toMark' | 'topRanked' | 'removableCount' | 'eligibleCount'
>;

function toPreviewState(query: PreviewQueryLike, isStale: boolean): PreviewState {
  const plan = query.data?.plan ?? EMPTY_PLAN;
  const inBatch = new Set(plan.toMark.map((m) => m.tmdbId));
  return {
    isLoading: query.isLoading,
    isStale,
    error: query.error ? query.error.message : null,
    skippedReason: query.data?.skippedReason ?? null,
    movies: plan.topRanked.map((m) => ({ ...m, inNextBatch: inBatch.has(m.tmdbId) })),
    removableCount: plan.removableCount,
    eligibleCount: plan.eligibleCount,
    markedNow: plan.toMark.length,
  };
}

export function useRotationTuning(): RotationTuningModel {
  const queryClient = useQueryClient();
  const [edited, setEdited] = useState<Partial<TuningValues>>({});
  const [clearedCount, setClearedCount] = useState<number | null>(null);

  const settingsQuery = useQuery({
    queryKey: SETTINGS_QUERY_KEY,
    queryFn: async () => unwrap(await rotationGetSettings()).data,
  });

  const stored = useMemo(() => storedValues(settingsQuery.data), [settingsQuery.data]);

  const values = useMemo(() => (stored ? { ...stored, ...edited } : null), [stored, edited]);
  const isDirty = Object.keys(edited).length > 0;

  // Only the knobs actually touched travel with the preview. An untouched form
  // then previews the stored configuration, which is what the next cycle runs.
  const overrides = useMemo(() => ({ ...edited }), [edited]);
  const settledOverrides = useDebounced(overrides, PREVIEW_DEBOUNCE_MS);
  const isStale = JSON.stringify(overrides) !== JSON.stringify(settledOverrides);

  const previewQuery = useQuery({
    queryKey: [...PREVIEW_QUERY_KEY, settledOverrides],
    queryFn: async () =>
      unwrap(
        await rotationSchedulerRemovalPreview({ query: { ...settledOverrides, topCount: 10 } })
      ).data,
  });

  const setValue = useCallback((key: TuningKey, value: number) => {
    setEdited((prev) => ({ ...prev, [key]: value }));
  }, []);

  const reset = useCallback(() => setEdited({}), []);

  const saveMutation = useMutation({
    mutationFn: async (body: Partial<TuningValues>) =>
      unwrap(await rotationSaveSettings({ body })).data,
    onSuccess: async () => {
      setEdited({});
      await queryClient.invalidateQueries({ queryKey: SETTINGS_QUERY_KEY });
    },
  });

  const resetQueueMutation = useMutation({
    mutationFn: async () => unwrap(await rotationSchedulerResetQueue({ body: {} })).data,
    onSuccess: async (data) => {
      setClearedCount(data.cleared);
      await queryClient.invalidateQueries({ queryKey: PREVIEW_QUERY_KEY });
    },
  });

  return {
    values,
    isDirty,
    setValue,
    reset,
    save: () => saveMutation.mutate(edited),
    isSaving: saveMutation.isPending,
    saveError: saveMutation.error ? saveMutation.error.message : null,
    preview: toPreviewState(previewQuery, isStale),
    resetQueue: () => resetQueueMutation.mutate(),
    isResettingQueue: resetQueueMutation.isPending,
    clearedCount,
  };
}
