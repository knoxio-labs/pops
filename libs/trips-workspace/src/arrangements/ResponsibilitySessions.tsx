import { createContext, useContext, useState } from 'react';

import { arrangementsKey } from './api';
import { ResponsibilitySession } from './responsibility-session';

import type { JSX, ReactNode } from 'react';

import type { ArrangementTarget, ArrangementsWorkspaceProps } from './types';

const Sessions = createContext<Map<string, ResponsibilitySession> | undefined>(undefined);

/** Scope retained responsibility operations to one mounted owning-trip/API workspace, above conditional dialogs. */
export function ResponsibilitySessions({ children }: { children: ReactNode }): JSX.Element {
  const [sessions] = useState(() => new Map<string, ResponsibilitySession>());
  return <Sessions.Provider value={sessions}>{children}</Sessions.Provider>;
}

/** Return the same operation controller for the exact API origin, trip, source kind and source identity. */
export function useResponsibilitySession(
  identity: ArrangementsWorkspaceProps,
  target: ArrangementTarget
): ResponsibilitySession {
  const shared = useContext(Sessions);
  const [local] = useState(() => new Map<string, ResponsibilitySession>());
  const sessions = shared ?? local;
  const key = JSON.stringify([...arrangementsKey(identity), target.targetKind, target.targetId]);
  const retained = sessions.get(key);
  if (retained) return retained;
  const session = new ResponsibilitySession();
  sessions.set(key, session);
  return session;
}
