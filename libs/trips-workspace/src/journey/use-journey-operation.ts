import { useRef, useState } from 'react';

import type { JourneyNavigation } from './use-journey-navigation';

/** One serial grouping action with errors scoped to the viewed workspace context. */
export interface JourneyOperation {
  busy: boolean;
  failure: unknown;
  clear: () => void;
  run: (operation: () => Promise<void>) => Promise<void>;
}
/** Late responses may update canonical cache but never expose another view's action error. */
export function useJourneyOperation(navigation: JourneyNavigation): JourneyOperation {
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<{ error: unknown; contextVersion: number }>();
  const lock = useRef(false);
  return {
    busy,
    failure: failure?.contextVersion === navigation.contextVersion ? failure.error : undefined,
    clear: (): void => setFailure(undefined),
    run: async (operation): Promise<void> => {
      if (lock.current) return;
      const stamp = navigation.stamp();
      lock.current = true;
      setBusy(true);
      setFailure(undefined);
      try {
        await operation();
      } catch (error) {
        if (navigation.isCurrent(stamp))
          setFailure({ error, contextVersion: navigation.contextVersion });
      } finally {
        lock.current = false;
        setBusy(false);
      }
    },
  };
}
