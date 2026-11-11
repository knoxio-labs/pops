import { useRef, useState } from 'react';

import { client as defaultClient } from './trips-api/client.gen';

import type { CaptureContextProps } from './CaptureContext';
import type { TimelineSelection } from './timeline-context-types';

/** Fence contextual source callbacks by their original transport and selection generation. */
export function useTimelineSelection(client: CaptureContextProps['client']) {
  const owner = client ?? defaultClient;
  const [origin] = useState(() => owner.getConfig().baseUrl);
  const [state, setState] = useState<{ selection: TimelineSelection | null; generation: number }>({
    selection: null,
    generation: 0,
  });
  const currentGeneration = useRef(0);
  const [changed, setChanged] = useState(false);
  const onSelect = (selection: TimelineSelection | null) => {
    if (owner.getConfig().baseUrl !== origin) {
      setChanged(true);
      return;
    }
    if (currentGeneration.current !== state.generation) return;
    currentGeneration.current += 1;
    setState({ selection, generation: currentGeneration.current });
  };
  return { selection: state.selection, onSelect, changed };
}
