import { useMutation } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';

import { unwrap } from '../../bfm-api-helpers.js';
import { operatorIssuePairingCode } from '../../bfm-api/index.js';
import { classifyOperatorFailure, type OperatorFailure } from './operator-failures.js';

import type { OperatorIssuePairingCodeResponses } from '../../bfm-api/types.gen.js';

export type IssuedPairingCode = OperatorIssuePairingCodeResponses['201'];

/** How often the remaining-TTL readout is recomputed. */
const TICK_MS = 1000;

export type PairingState = 'idle' | 'minting' | 'issued' | 'expired' | 'failed';

export interface PairingCodeModel {
  state: PairingState;
  /** The plaintext payload, and `null` the moment it is spent or dismissed. */
  issued: IssuedPairingCode | null;
  remainingMs: number;
  failure: OperatorFailure | null;
  mint: () => void;
  dismiss: () => void;
}

/**
 * Milliseconds left on a code, clamped at zero.
 *
 * An `expiresAt` that will not parse counts as already expired. That is the
 * safe direction: a code whose deadline we cannot read would otherwise sit on
 * screen forever, looking valid, which is the exact failure this is here to
 * prevent.
 */
export function remainingUntil(expiresAt: string, now: number): number {
  const deadline = new Date(expiresAt).getTime();
  if (!Number.isFinite(deadline)) return 0;
  return Math.max(0, deadline - now);
}

/**
 * Milliseconds left on a deadline, re-read once a second while one is set.
 *
 * `now` is seeded at mount and refreshed by the effect rather than read during
 * render. On the render immediately after a code arrives that makes the
 * readout a fraction of a second generous, which self-corrects on the first
 * tick — the alternative, a `now` that lags behind the new deadline, would
 * read as zero and expire a freshly minted code on sight.
 */
function useCountdownTo(expiresAt: string | null): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (expiresAt === null) return;

    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(timer);
  }, [expiresAt]);

  return expiresAt === null ? 0 : remainingUntil(expiresAt, now);
}

/**
 * Owns a minted pairing code for as long as it is valid, and not one tick
 * longer.
 *
 * The plaintext lives in this hook's state and nowhere else — not in
 * `localStorage`, not in the URL, not in a log line, and deliberately not left
 * behind in React Query's mutation cache, which is why every settled mint is
 * `reset`. bfm keeps only a digest, so this string is the single copy in
 * existence; expiry and dismissal both clear the cell rather than hide it.
 */
export function usePairingCode(): PairingCodeModel {
  const [issued, setIssued] = useState<IssuedPairingCode | null>(null);
  const [hasExpired, setHasExpired] = useState(false);
  const [failure, setFailure] = useState<OperatorFailure | null>(null);

  const remainingMs = useCountdownTo(issued?.expiresAt ?? null);
  const isSpent = issued !== null && remainingMs <= 0;

  useEffect(() => {
    if (!isSpent) return;
    setIssued(null);
    setHasExpired(true);
  }, [isSpent]);

  const mutation = useMutation({
    mutationFn: async () => unwrap(await operatorIssuePairingCode({ body: {} })),
  });
  const { mutateAsync, reset } = mutation;

  /**
   * Which mint the hook is still willing to hear back from.
   *
   * Dismissing bumps it, so a request already in flight when the operator
   * closed the dialog cannot land its payload afterwards. Without this,
   * clicking Done before the response arrives puts the plaintext back into
   * state — invisible, because the dialog is shut, but alive in memory with a
   * countdown running against a code the operator already walked away from.
   */
  const currentMint = useRef(0);

  /**
   * The mint this hook is still waiting on, rather than `mutation.isPending`:
   * React Query keeps reporting a dismissed request as in flight, which would
   * leave a closed dialog claiming to be minting.
   */
  const [pendingMint, setPendingMint] = useState<number | null>(null);

  const mint = useCallback(() => {
    const id = (currentMint.current += 1);

    setFailure(null);
    setHasExpired(false);
    setIssued(null);
    setPendingMint(id);

    // `reset` runs whether or not the result is still wanted: a stale
    // resolution repopulates React Query's mutation cache with the plaintext,
    // and the `reset` that `dismiss` already ran happened too early to clear it.
    void mutateAsync()
      .then((code) => {
        if (currentMint.current !== id) return;
        setIssued(code);
        setPendingMint(null);
      })
      .catch((err: unknown) => {
        if (currentMint.current !== id) return;
        setFailure(classifyOperatorFailure(err));
        setPendingMint(null);
      })
      .finally(() => reset());
  }, [mutateAsync, reset]);

  const dismiss = useCallback(() => {
    currentMint.current += 1;
    setPendingMint(null);
    setIssued(null);
    setHasExpired(false);
    setFailure(null);
    reset();
  }, [reset]);

  const visible = isSpent ? null : issued;

  return {
    state: derivePairingState({
      isMinting: pendingMint !== null,
      hasFailure: failure !== null,
      hasCode: visible !== null,
      hasExpired,
    }),
    issued: visible,
    remainingMs,
    failure,
    mint,
    dismiss,
  };
}

function derivePairingState(flags: {
  isMinting: boolean;
  hasFailure: boolean;
  hasCode: boolean;
  hasExpired: boolean;
}): PairingState {
  if (flags.isMinting) return 'minting';
  if (flags.hasFailure) return 'failed';
  if (flags.hasCode) return 'issued';
  if (flags.hasExpired) return 'expired';
  return 'idle';
}
