import { useQueryClient } from '@tanstack/react-query';
import { useRef, useState, useSyncExternalStore } from 'react';

import { loadStays } from '../stay/api';
import { arrangementsKey, createGapStay } from './api';
import { useGapCaptureSession } from './GapCaptureSessions';

import type { Stay } from '../stay/types';
import type { ArrangementCoverageFinding } from './coverage';
import type { GapCaptureBinding } from './gap-capture-registry';
import type { ArrangementTarget, ArrangementsWorkspaceProps } from './types';

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
  identity: ArrangementsWorkspaceProps,
  open: (target: ArrangementTarget) => void
): GapCapture {
  const queryClient = useQueryClient();
  const binding = useGapCaptureSession(identity);
  const key = [...arrangementsKey(binding.identity), 'stays'];
  const capture = binding.session;
  const state = useSyncExternalStore(capture.subscribe, capture.read, capture.read);
  const reads = useGapReads(binding);
  function present(source: Stay): void {
    if (!binding.isCurrent()) return;
    queryClient.setQueryData<Stay[]>(key, (previous) => [
      ...(previous ?? []).filter((stay) => stay.id !== source.id),
      source,
    ]);
    open({ targetKind: 'stay', targetId: source.id });
  }
  async function create(visitId: number, interval: ArrangementCoverageFinding): Promise<void> {
    if (!binding.isCurrent() || capture.pending()) return;
    const intent = { visitId, arrival: interval.arrival, departure: interval.departure };
    const current = capture.select(intent);
    if (current.kind === 'uncertain') return;
    if (current.kind === 'acknowledged') {
      present(current.source);
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
    present(source);
  }
  return {
    busy: state.kind === 'creating' || reads.busy,
    uncertain: state.kind === 'uncertain',
    failure: reads.failure ?? (state.kind === 'uncertain' ? state.error : undefined),
    create,
    reload: reads.reload,
    beginNew: (): void => {
      if (binding.isCurrent()) capture.beginNew();
    },
  };
}
function useGapReads(binding: GapCaptureBinding): {
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
      if (!binding.isCurrent() || pending.current.has(binding)) return;
      pending.current.add(binding);
      setBusy((current) => new Set(current).add(binding));
      try {
        const sources = await loadStays(binding.identity.tripId, binding.identity.client);
        if (!binding.isCurrent()) return;
        cache.setQueryData([...arrangementsKey(binding.identity), 'stays'], sources);
        setFailure(undefined);
      } catch (error) {
        if (binding.isCurrent()) setFailure({ binding, error });
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
