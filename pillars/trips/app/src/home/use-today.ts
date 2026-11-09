import { useSyncExternalStore } from 'react';

import { todayISODate } from '@pops/date';

function subscribe(changed: () => void): () => void {
  let timer: ReturnType<typeof setTimeout>;
  const schedule = (): void => {
    const now = new Date();
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    timer = setTimeout(() => {
      changed();
      schedule();
    }, midnight.getTime() - now.getTime());
  };
  const visible = (): void => changed();
  schedule();
  document.addEventListener('visibilitychange', visible);
  return () => {
    clearTimeout(timer);
    document.removeEventListener('visibilitychange', visible);
  };
}
/** Re-evaluate calendar groups at the viewer's local midnight and when a suspended tab resumes. */
export function useToday(): string {
  return useSyncExternalStore(subscribe, todayISODate, todayISODate);
}
