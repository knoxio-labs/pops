import { useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';

import { loadStays } from '../stay/api';
import { arrangementsKey, createGapStay } from './api';

import type { Stay } from '../stay/types';
import type { ArrangementCoverageFinding } from './coverage';
import type { ArrangementTarget, ArrangementsWorkspaceProps } from './types';

type Intent = { visitId: number; arrival: string; departure: string };
type Operation =
  | { kind: 'ready' }
  | { kind: 'creating'; intent: Intent }
  | { kind: 'acknowledged'; intent: Intent; source: Stay }
  | { kind: 'uncertain'; intent: Intent; error: unknown };
/** Source capture retains an acknowledged identity or an unresolved operation; a GET never settles a lost POST response. */
export interface GapCapture {
  busy: boolean;
  uncertain: boolean;
  failure: unknown;
  create: (visitId: number, interval: ArrangementCoverageFinding) => Promise<void>;
  reload: () => Promise<void>;
  beginNew: () => void;
}
/** Explicit capture state is mirrored only for immediate event-handler guards, never for rendering. */
interface CaptureState {
  state: Operation;
  current: () => Operation;
  update: (operation: Operation) => void;
}
function useCaptureState(): CaptureState {
  const [state, setState] = useState<Operation>({ kind: 'ready' });
  const operation = useRef<Operation>({ kind: 'ready' });
  return {
    state,
    current: (): Operation => operation.current,
    update: (next): void => {
      operation.current = next;
      setState(next);
    },
  };
}
/** Create for an explicitly chosen gap; acknowledged retries open only, uncertain outcomes require conscious new intent. */
export function useGapCapture(
  identity: ArrangementsWorkspaceProps,
  open: (target: ArrangementTarget) => void
): GapCapture {
  const queryClient = useQueryClient();
  const key = [...arrangementsKey(identity), 'stays'];
  const capture = useCaptureState();
  const reads = useGapReads(identity);
  async function create(visitId: number, interval: ArrangementCoverageFinding): Promise<void> {
    const current = capture.current();
    if (current.kind === 'creating' || current.kind === 'uncertain') return;
    const intent = { visitId, arrival: interval.arrival, departure: interval.departure };
    if (current.kind === 'acknowledged' && sameIntent(current.intent, intent)) {
      open({ targetKind: 'stay', targetId: current.source.id });
      return;
    }
    capture.update({ kind: 'creating', intent });
    let source: Stay;
    try {
      source = await createGapStay(identity, visitId, interval.arrival, interval.departure);
    } catch (error) {
      capture.update({ kind: 'uncertain', intent, error });
      return;
    }
    capture.update({ kind: 'acknowledged', intent, source });
    queryClient.setQueryData<Stay[]>(key, (previous) => [
      ...(previous ?? []).filter((stay) => stay.id !== source.id),
      source,
    ]);
    open({ targetKind: 'stay', targetId: source.id });
  }
  return {
    busy: capture.state.kind === 'creating' || reads.busy,
    uncertain: capture.state.kind === 'uncertain',
    failure:
      reads.failure ?? (capture.state.kind === 'uncertain' ? capture.state.error : undefined),
    create,
    reload: reads.reload,
    beginNew: (): void => {
      if (capture.current().kind === 'uncertain') capture.update({ kind: 'ready' });
    },
  };
}
function sameIntent(first: Intent, second: Intent): boolean {
  return (
    first.visitId === second.visitId &&
    first.arrival === second.arrival &&
    first.departure === second.departure
  );
}
function useGapReads(identity: ArrangementsWorkspaceProps): {
  busy: boolean;
  failure: unknown;
  reload: () => Promise<void>;
} {
  const cache = useQueryClient();
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<unknown>();
  return {
    busy,
    failure,
    reload: async (): Promise<void> => {
      if (pending.current) return;
      pending.current = true;
      setBusy(true);
      try {
        const sources = await loadStays(identity.tripId, identity.client);
        cache.setQueryData([...arrangementsKey(identity), 'stays'], sources);
        setFailure(undefined);
      } catch (error) {
        setFailure(error);
      } finally {
        pending.current = false;
        setBusy(false);
      }
    },
  };
}
