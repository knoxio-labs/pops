import { useSyncExternalStore } from 'react';

import { RetainedSessionStore } from '../shared/retained-session-store';
import { useRetainedSession } from '../shared/use-retained-session';
import { useSessionView } from '../shared/use-session-view';
import { PlaceCaptureSession } from './place-capture-session';

import type { PlaceCaptureState } from './place-capture-session';
import type { VisitWorkspaceProps, VisitFieldProps } from './types';

/** Independent place creation receipt; a failed association never retries the creation. */
export interface PlaceCapture extends PlaceCaptureState {
  setName: (name: string) => void;
  submit: () => Promise<void>;
  reload: () => void;
  /** Start another capture only after the source confirms this receipt's association. */
  beginNew: (associatedPlaceId: number) => void;
}
const sessions = new RetainedSessionStore<PlaceCaptureSession>();

/** Preserve exact-owner creation proof across view remounts without retaining a closed view's association callback. */
export function usePlaceCapture(
  identity: VisitWorkspaceProps,
  commit: VisitFieldProps['commit'],
  reload: () => Promise<unknown>
): PlaceCapture {
  const retained = useRetainedSession(
    sessions,
    {
      client: identity.client,
      tripId: identity.tripId,
      kind: 'visit-place-capture',
      sourceId: identity.visitId,
    },
    (owner) => new PlaceCaptureSession(owner)
  );
  const session = retained.session;
  const view = useSessionView(retained.owner);
  const state = useSyncExternalStore(session.subscribe, session.getState, session.getState);
  return {
    ...state,
    beginNew: (associatedPlaceId): void => {
      if (view.isCurrent()) session.beginNew(associatedPlaceId);
    },
    submit: (): Promise<void> => session.submit(commit, view),
    setName: (name): void => {
      if (view.isCurrent()) session.setName(name);
    },
    reload: (): void => session.reload(reload, view),
  };
}
