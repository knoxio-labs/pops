import { useQueryClient } from '@tanstack/react-query';
import { useMemo, useRef, useState, useSyncExternalStore } from 'react';

import { useSessionView } from '../shared/use-session-view';
import { accommodationStays } from './accommodation-gap-read';
import { settleAccommodationStay } from './accommodation-gap-settlement';
import { createGapStay } from './api';
import { useGapCaptureSession } from './GapCaptureSessions';

import type { SourceSessionView } from '../shared/retained-session-store';
import type { Stay } from '../stay/types';
import type { AccommodationGapIdentity } from './accommodation-gap-types';
import type { ArrangementCoverageFinding } from './coverage';
import type { GapCaptureBinding } from './gap-capture-registry';
import type { ArrangementTarget } from './types';

/** Source capture retains an acknowledged identity or an unresolved operation; a GET never settles a lost POST response. */
export interface GapCapture {
  busy: boolean;
  uncertain: boolean;
  failure: unknown;
  create: (visitId: number, interval: ArrangementCoverageFinding) => Promise<void>;
  reload: () => Promise<void>;
  beginNew: () => void;
}
/** Create for an explicitly chosen gap; acknowledged retries open only, uncertain outcomes require conscious new intent. */
export function useGapCapture(
  identity: AccommodationGapIdentity,
  open: (target: ArrangementTarget) => void,
  visitId?: number,
  isVisible?: () => boolean
): GapCapture {
  const queryClient = useQueryClient();
  const binding = useGapCaptureSession(identity);
  const owner = useMemo(
    () => ({
      ...binding.owner,
      scope: queryClient,
      kind: 'accommodation-gap',
      sourceId: binding.owner.tripId,
    }),
    [binding.owner, queryClient]
  );
  const view = useSessionView(owner);
  const capture = binding.session;
  const state = useSyncExternalStore(capture.subscribe, capture.read, capture.read);
  const reads = useGapReads(binding, view);
  function present(source: Stay): void {
    if (!binding.isCurrent() || !view.isCurrent() || (isVisible && !isVisible())) return;
    open({ targetKind: 'stay', targetId: source.id });
  }
  const settle = settleAccommodationStay(queryClient, binding, view, isVisible);
  return {
    busy: capture.pending() || reads.busy,
    uncertain:
      state.kind === 'uncertain' && (visitId === undefined || state.intent.visitId === visitId),
    failure:
      reads.failure ??
      (state.kind === 'uncertain' && (visitId === undefined || state.intent.visitId === visitId)
        ? state.error
        : undefined),
    create: gapCreate(binding, view, { present, settle }),
    reload: reads.reload,
    beginNew: (): void => {
      if (
        view.isCurrent() &&
        binding.isCurrent() &&
        (visitId === undefined || (state.kind === 'uncertain' && state.intent.visitId === visitId))
      )
        capture.beginNew(state.kind === 'uncertain' ? state.intent : undefined);
    },
  };
}
function useGapReads(
  binding: GapCaptureBinding,
  view: SourceSessionView
): {
  busy: boolean;
  failure: unknown;
  reload: () => Promise<void>;
} {
  const cache = useQueryClient();
  const pending = useRef(new Set<GapCaptureBinding>());
  const [busy, setBusy] = useState<ReadonlySet<GapCaptureBinding>>(() => new Set());
  const [failure, setFailure] = useState<{ binding: GapCaptureBinding; error: unknown }>();
  return {
    busy: busy.has(binding),
    failure: failure?.binding === binding ? failure.error : undefined,
    reload: async (): Promise<void> => {
      if (!view.isCurrent() || !binding.isCurrent() || pending.current.has(binding)) return;
      pending.current.add(binding);
      setBusy((current) => new Set(current).add(binding));
      try {
        const sources = await accommodationStays(binding);
        if (!view.isCurrent() || !binding.isCurrent()) return;
        cache.setQueryData(binding.staysKey, sources);
        await cache.invalidateQueries({
          queryKey: binding.staysPrefix,
          refetchType: binding.isCurrent() && view.isCurrent() ? 'active' : 'none',
        });
        setFailure(undefined);
      } catch (error) {
        if (view.isCurrent() && binding.isCurrent()) setFailure({ binding, error });
      } finally {
        pending.current.delete(binding);
        setBusy((current) => {
          const next = new Set(current);
          next.delete(binding);
          return next;
        });
      }
    },
  };
}

function gapCreate(
  binding: GapCaptureBinding,
  view: SourceSessionView,
  delivery: { present: (source: Stay) => void; settle: (source: Stay) => void }
): GapCapture['create'] {
  const capture = binding.session;
  return async (visitId: number, interval: ArrangementCoverageFinding): Promise<void> => {
    if (!view.isCurrent() || !binding.isCurrent() || capture.pending()) return;
    const intent = { visitId, arrival: interval.arrival, departure: interval.departure };
    const current = capture.select(intent);
    if (current.kind === 'uncertain') return;
    if (current.kind === 'acknowledged') {
      delivery.settle(current.source);
      delivery.present(current.source);
      return;
    }
    capture.update({ kind: 'creating', intent });
    let source: Stay;
    try {
      source = await createGapStay(binding.identity, visitId, interval.arrival, interval.departure);
    } catch (error) {
      capture.update({ kind: 'uncertain', intent, error });
      return;
    }
    capture.update({ kind: 'acknowledged', intent, source });
    delivery.settle(source);
    delivery.present(source);
  };
}
