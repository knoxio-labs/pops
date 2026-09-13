/**
 * Port of
 * `pillars/inventory/app/src/pages/item-form-page/useAssetIdValidation.ts`.
 *
 * The source checks uniqueness with `itemsSearchByAssetId` and generates the
 * next free id with `itemsCountByAssetPrefix`, both server round trips. The
 * canvas has no server: both are resolved against a fixed pool of taken
 * asset ids from the fixtures, behind the same short artificial delay the
 * network call would have taken, so the checking spinner and the generating
 * spinner stay visible exactly as they do against the real API.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import { extractPrefix } from './types';

import type { RefObject } from 'react';

const SIMULATED_LATENCY_MS = 450;

export interface TakenAssetId {
  /** The item's own id, so an edit-mode form can skip flagging its own asset id. */
  id: string;
  assetId: string;
  itemName: string;
}

/** Pure lookup the hook below runs behind a simulated round trip. */
export function findAssetIdConflict(
  value: string,
  currentItemId: string | undefined,
  taken: readonly TakenAssetId[]
): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const match = taken.find((t) => t.assetId === trimmed);
  if (!match || match.id === currentItemId) return null;
  return `Asset ID already in use by ${match.itemName}`;
}

/** Next free id for `prefix`, given the same taken pool `findAssetIdConflict` checks against. */
export function nextAssetIdForPrefix(prefix: string, taken: readonly TakenAssetId[]): string {
  const count = taken.filter((t) => t.assetId.startsWith(prefix)).length;
  const nextNum = count + 1;
  const padded = nextNum >= 100 ? String(nextNum) : String(nextNum).padStart(2, '0');
  return `${prefix}${padded}`;
}

function useClearTimersOnUnmount(
  checkTimer: RefObject<ReturnType<typeof setTimeout> | null>,
  generateTimer: RefObject<ReturnType<typeof setTimeout> | null>
) {
  useEffect(
    () => () => {
      if (checkTimer.current) clearTimeout(checkTimer.current);
      if (generateTimer.current) clearTimeout(generateTimer.current);
    },
    [checkTimer, generateTimer]
  );
}

interface UseAssetIdValidationArgs {
  id: string | undefined;
  typeValue: string;
  takenAssetIds: readonly TakenAssetId[];
  setValue: (field: 'assetId', value: string) => void;
  /**
   * Not part of the source hook: the source only validates on the field's
   * `onBlur`, which nothing but a person can trigger. Passing the field's
   * initial value here runs that same check once on mount, so a screen state
   * can open already mid-check (or already resolved to taken/free) without
   * needing a synthetic blur.
   */
  checkOnMountValue?: string;
}

export function useAssetIdValidation({
  id,
  typeValue,
  takenAssetIds,
  setValue,
  checkOnMountValue,
}: UseAssetIdValidationArgs) {
  const initialCheckValue = checkOnMountValue?.trim() ? checkOnMountValue : undefined;
  const [assetIdError, setAssetIdError] = useState<string | null>(null);
  const [assetIdChecking, setAssetIdChecking] = useState(!!initialCheckValue);
  const [generating, setGenerating] = useState(false);
  const checkTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const generateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useClearTimersOnUnmount(checkTimer, generateTimer);

  const validateAssetIdUniqueness = useCallback(
    (value: string) => {
      if (checkTimer.current) clearTimeout(checkTimer.current);
      if (!value.trim()) {
        setAssetIdError(null);
        return;
      }
      setAssetIdChecking(true);
      checkTimer.current = setTimeout(() => {
        setAssetIdError(findAssetIdConflict(value, id, takenAssetIds));
        setAssetIdChecking(false);
      }, SIMULATED_LATENCY_MS);
    },
    [id, takenAssetIds]
  );

  // `assetIdChecking`'s initial value above already reflects a pending
  // mount-time check; this effect only starts the timer that resolves it, so
  // it never calls setState synchronously on its own turn.
  useEffect(() => {
    if (!initialCheckValue) return;
    checkTimer.current = setTimeout(() => {
      setAssetIdError(findAssetIdConflict(initialCheckValue, id, takenAssetIds));
      setAssetIdChecking(false);
    }, SIMULATED_LATENCY_MS);
  }, [initialCheckValue, id, takenAssetIds]);

  const handleAutoGenerate = useCallback(() => {
    if (!typeValue) return;
    setGenerating(true);
    if (generateTimer.current) clearTimeout(generateTimer.current);
    generateTimer.current = setTimeout(() => {
      const prefix = extractPrefix(typeValue);
      const newAssetId = nextAssetIdForPrefix(prefix, takenAssetIds);
      setValue('assetId', newAssetId);
      setAssetIdError(null);
      setGenerating(false);
      validateAssetIdUniqueness(newAssetId);
    }, SIMULATED_LATENCY_MS);
  }, [typeValue, takenAssetIds, setValue, validateAssetIdUniqueness]);

  return {
    assetIdError,
    assetIdChecking,
    generating,
    validateAssetIdUniqueness,
    handleAutoGenerate,
  };
}
