import { referencedEntityIds } from '@pops/finance';

import { useCanonicalContacts } from '../../../lib/useCanonicalContacts';
import { useImportStore } from '../../../store/importStore';

/** Resolve the import's historical references once through the query cache, preserving all stored ids. */
export function useImportIdentities(extraIds: readonly string[] = []) {
  const processed = useImportStore((s) => s.processedTransactions);
  const confirmed = useImportStore((s) => s.confirmedTransactions);
  const corrections = useImportStore((s) => s.pendingChangeSets);
  const tags = useImportStore((s) => s.pendingTagRuleChangeSets);
  return useCanonicalContacts([
    ...referencedEntityIds([processed, confirmed, corrections, tags]),
    ...extraIds,
  ]);
}
