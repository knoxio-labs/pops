import { createContext, useContext } from 'react';

import type { DocumentLinkingState } from './model';

/** Local document identities and explicit link changes shared by both proposals. */
export const DocumentContext = createContext<
  { state: DocumentLinkingState; change: (state: DocumentLinkingState) => void } | undefined
>(undefined);
/** Access local linking controls without a production client. */
export function useDocuments() {
  const value = useContext(DocumentContext);
  if (!value) throw new Error('Document workspace missing');
  return value;
}
