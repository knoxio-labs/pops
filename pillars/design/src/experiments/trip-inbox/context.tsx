import { createContext, useContext } from 'react';

import type { InboxState } from './model';

/** Shared local sources and organisation actions; original captures remain independent of targets. */
export const InboxContext = createContext<
  { state: InboxState; change: (next: InboxState) => void } | undefined
>(undefined);

/** Access the local Inbox without persistence or a production client. */
export function useInbox() {
  const context = useContext(InboxContext);
  if (!context) throw new Error('Inbox workspace missing');
  return context;
}
