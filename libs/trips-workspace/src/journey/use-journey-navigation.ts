import { useLayoutEffect, useRef, useState } from 'react';

import type { JourneyWorkspaceProps } from './types';

/** Workspace-local navigation identity and guards for asynchronous source/selection responses. */
export interface JourneyNavigation {
  viewed: number;
  contextVersion: number;
  stamp: () => number;
  isCurrent: (stamp: number) => boolean;
  replace: (id: number) => void;
}
interface NavigationState {
  viewed: number;
  version: number;
  contextVersion: number;
  expected: number | undefined;
}

/** Keep literal route identity controlled by the host while retaining Undo through own replace navigation. */
export function useJourneyNavigation(props: JourneyWorkspaceProps): JourneyNavigation {
  const [local, setLocal] = useState(props.journeyId);
  const [observedInput, setObservedInput] = useState(props.journeyId);
  const changed = observedInput !== props.journeyId;
  if (changed) {
    setObservedInput(props.journeyId);
    setLocal(props.journeyId);
  }
  const viewed = props.onViewJourney || changed ? props.journeyId : local;
  const [generation, setGeneration] = useState<NavigationState>({
    viewed,
    version: 0,
    contextVersion: 0,
    expected: undefined,
  });
  if (generation.viewed !== viewed) {
    setGeneration({
      viewed,
      version: generation.version + 1,
      contextVersion: generation.contextVersion + Number(generation.expected !== viewed),
      expected: undefined,
    });
  }
  const guard = useNavigationGuard(generation);
  return {
    ...guard,
    viewed,
    contextVersion: generation.contextVersion,
    replace: (id): void => {
      setGeneration((previous) => ({ ...previous, expected: id }));
      setLocal(id);
      props.onViewJourney?.(id);
    },
  };
}
function useNavigationGuard(
  state: NavigationState
): Pick<JourneyNavigation, 'stamp' | 'isCurrent'> {
  const latest = useRef(state);
  const alive = useRef(true);
  useLayoutEffect(() => {
    latest.current = state;
  }, [state]);
  useLayoutEffect(() => {
    alive.current = true;
    return (): void => {
      alive.current = false;
    };
  }, []);
  return {
    stamp: (): number => latest.current.version,
    isCurrent: (stamp): boolean => alive.current && stamp === latest.current.version,
  };
}
