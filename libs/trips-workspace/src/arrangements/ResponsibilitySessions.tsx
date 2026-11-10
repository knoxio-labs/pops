import { createContext, useContext, useLayoutEffect, useState } from 'react';

import { ResponsibilityRegistry } from './responsibility-registry';

import type { JSX, ReactNode } from 'react';

import type { ResponsibilityBinding } from './responsibility-registry';
import type { ArrangementTarget, ArrangementsWorkspaceProps } from './types';

const Sessions = createContext<ResponsibilityRegistry | undefined>(undefined);

/** Retain exact owner responsibility controllers for the mounted host lifetime, above keyed trip/origin views. */
export function ResponsibilitySessions({
  children,
  identity,
}: {
  children: ReactNode;
  identity: ArrangementsWorkspaceProps;
}): JSX.Element {
  const [sessions] = useState(() => new ResponsibilityRegistry(identity));
  useLayoutEffect(() => {
    sessions.activate(identity);
    return () => sessions.deactivate();
  });
  return <Sessions.Provider value={sessions}>{children}</Sessions.Provider>;
}

/** Resolve an exact client/origin/trip/target controller with a live guard against the committed host context. */
export function useResponsibilitySession(
  identity: ArrangementsWorkspaceProps,
  target: ArrangementTarget
): ResponsibilityBinding {
  const shared = useContext(Sessions);
  const [local] = useState(() => new ResponsibilityRegistry(identity));
  useLayoutEffect(() => {
    if (shared) return;
    local.activate(identity);
    return () => local.deactivate();
  });
  const sessions = shared ?? local;
  return sessions.get(identity, target);
}
