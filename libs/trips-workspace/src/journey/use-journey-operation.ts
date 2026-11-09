import { useRef, useState } from 'react';

import type { JourneyNavigation } from './use-journey-navigation';

/** One serial grouping action; uncertain writes require a successful canonical reload. */
export interface JourneyOperation {
  busy: boolean;
  needsReload: boolean;
  failure: unknown;
  reload: (read: () => Promise<boolean>) => Promise<void>;
  run: (operation: () => Promise<void>) => Promise<void>;
}
/** Late failures remain view-scoped while mutation uncertainty survives source navigation. */
export function useJourneyOperation(navigation: JourneyNavigation): JourneyOperation {
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<{ error: unknown; contextVersion: number }>();
  const lock = useRef(false);
  const recovery = useJourneyRecovery();
  return {
    busy,
    needsReload: recovery.required,
    failure: failure?.contextVersion === navigation.contextVersion ? failure.error : undefined,
    reload: async (read): Promise<void> => {
      if (lock.current) return;
      lock.current = true;
      setBusy(true);
      try {
        if (await read()) {
          recovery.clear();
          setFailure(undefined);
        }
      } finally {
        lock.current = false;
        setBusy(false);
      }
    },
    run: async (operation): Promise<void> => {
      if (lock.current || recovery.isRequired()) return;
      const stamp = navigation.stamp();
      lock.current = true;
      setBusy(true);
      try {
        await operation();
      } catch (error) {
        recovery.block();
        if (navigation.isCurrent(stamp))
          setFailure({ error, contextVersion: navigation.contextVersion });
      } finally {
        lock.current = false;
        setBusy(false);
      }
    },
  };
}

function useJourneyRecovery(): {
  required: boolean;
  isRequired: () => boolean;
  block: () => void;
  clear: () => void;
} {
  const [required, setRequired] = useState(false);
  const uncertain = useRef(false);
  return {
    required,
    isRequired: (): boolean => uncertain.current,
    block: (): void => {
      uncertain.current = true;
      setRequired(true);
    },
    clear: (): void => {
      uncertain.current = false;
      setRequired(false);
    },
  };
}
