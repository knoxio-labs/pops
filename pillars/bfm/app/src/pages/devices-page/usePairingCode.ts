import { useMutation } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';

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
 * Owns a minted pairing code for as long as it is valid, and not one tick
 * longer.
 *
 * The plaintext lives in this hook's state and nowhere else — not in
 * `localStorage`, not in the URL, not in a log line, and deliberately not left
 * behind in React Query's mutation cache, which is why the mutation is `reset`
 * the moment its payload has been read. bfm keeps only a digest, so this
 * string is the single copy in existence; when it expires the state cell is
 * cleared rather than merely hidden.
 */
export function usePairingCode(): PairingCodeModel {
  const [issued, setIssued] = useState<IssuedPairingCode | null>(null);
  const [hasExpired, setHasExpired] = useState(false);
  const [failure, setFailure] = useState<OperatorFailure | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const expiresAt = issued?.expiresAt ?? null;

  useEffect(() => {
    if (expiresAt === null) return;

    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(timer);
  }, [expiresAt]);

  const remainingMs = expiresAt === null ? 0 : remainingUntil(expiresAt, now);
  const isSpent = expiresAt !== null && remainingMs <= 0;

  useEffect(() => {
    if (!isSpent) return;
    setIssued(null);
    setHasExpired(true);
  }, [isSpent]);

  const mutation = useMutation({
    mutationFn: async () => unwrap(await operatorIssuePairingCode({ body: {} })),
  });
  const { mutateAsync, reset } = mutation;

  const mint = useCallback(() => {
    setFailure(null);
    setHasExpired(false);
    setIssued(null);

    void mutateAsync()
      .then((code) => {
        setIssued(code);
        reset();
      })
      .catch((err: unknown) => {
        setFailure(classifyOperatorFailure(err));
        reset();
      });
  }, [mutateAsync, reset]);

  const dismiss = useCallback(() => {
    setIssued(null);
    setHasExpired(false);
    setFailure(null);
    reset();
  }, [reset]);

  const visible = isSpent ? null : issued;

  return {
    state: derivePairingState({
      isMinting: mutation.isPending,
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
