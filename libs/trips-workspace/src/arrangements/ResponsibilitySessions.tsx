import { createContext, useContext, useLayoutEffect, useState } from 'react';

import { ResponsibilityRegistry } from './responsibility-registry';

import type { JSX } from 'react';

import type {
  ArrangementResponsibilityProviderProps,
  ArrangementResponsibilityContext,
} from './responsibility-context';
import type { ResponsibilityBinding } from './responsibility-registry';
import type { ArrangementTarget } from './types';

const Sessions = createContext<ResponsibilityRegistry | undefined>(undefined);

/** Retain exact owner responsibility controllers for the mounted host lifetime, above keyed trip/origin views. */
export function ResponsibilitySessions({
  children,
  identity,
}: ArrangementResponsibilityProviderProps): JSX.Element {
  const [sessions] = useState(() => new ResponsibilityRegistry(identity));
  useLayoutEffect(() => {
    sessions.activate(identity);
    return () => sessions.deactivate();
  });
  return <Sessions.Provider value={sessions}>{children}</Sessions.Provider>;
}

/** Resolve an exact client/origin/trip/target controller with a live guard against the committed host context. */
export function useResponsibilitySession(
  identity: Pick<ArrangementResponsibilityContext, 'tripId' | 'client'>,
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
