import { createContext, useContext, useLayoutEffect, useState } from 'react';

import { GapCaptureRegistry } from './gap-capture-registry';

import type { JSX, ReactNode } from 'react';

import type { GapCaptureBinding } from './gap-capture-registry';
import type { ArrangementsWorkspaceProps } from './types';

const Sessions = createContext<GapCaptureRegistry | undefined>(undefined);
/** Retain non-idempotent source receipts above keyed trip/origin views for the mounted host lifetime. */
export function GapCaptureSessions({
  identity,
  children,
}: {
  identity: ArrangementsWorkspaceProps;
  children: ReactNode;
}): JSX.Element {
  const [sessions] = useState(() => new GapCaptureRegistry(identity));
  useLayoutEffect(() => {
    sessions.activate(identity);
    return () => sessions.deactivate();
  });
  return <Sessions.Provider value={sessions}>{children}</Sessions.Provider>;
}
/** Resolve an owner-bound controller; standalone callers retain only their own mounted hook lifetime. */
export function useGapCaptureSession(identity: ArrangementsWorkspaceProps): GapCaptureBinding {
  const shared = useContext(Sessions);
  const [local] = useState(() => new GapCaptureRegistry(identity));
  useLayoutEffect(() => {
    if (shared) return;
    local.activate(identity);
    return () => local.deactivate();
  });
  return (shared ?? local).get(identity);
}
