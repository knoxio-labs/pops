import { useCallback, useRef, useState } from 'react';

import { client as defaultClient } from './trips-api/client.gen';

import type { CaptureContextProps } from './CaptureContext';
import type { TimelineSelection } from './timeline-context-types';

/** Keep callbacks stable across unchanged renders, fencing them by original transport and actual selection generation. */
export function useTimelineSelection(client: CaptureContextProps['client']) {
  const owner = client ?? defaultClient;
  const [origin] = useState(() => owner.getConfig().baseUrl);
  const [state, setState] = useState<{ selection: TimelineSelection | null; generation: number }>({
    selection: null,
    generation: 0,
  });
  const currentGeneration = useRef(0);
  const [changed, setChanged] = useState(false);
  const generation = state.generation;
  const onSelect = useCallback(
    (selection: TimelineSelection | null) => {
      if (owner.getConfig().baseUrl !== origin) {
        setChanged(true);
        return;
      }
      if (currentGeneration.current !== generation) return;
      currentGeneration.current += 1;
      setState({ selection, generation: currentGeneration.current });
    },
    [generation, origin, owner]
  );
  return { selection: state.selection, onSelect, changed };
}
