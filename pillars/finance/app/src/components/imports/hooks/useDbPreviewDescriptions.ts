import { useQuery } from '@tanstack/react-query';

import { unwrap } from '../../../finance-api-helpers.js';
import { transactionsDescriptionsForPreview } from '../../../finance-api/index.js';

/**
 * Descriptions of every committed transaction, for the impact panel's
 * database slot.
 *
 * A correction rule outlives the import that created it and re-decides rows
 * already in the database, so "affected rows" is only honest when it counts
 * those too. Both the browse dialog and the import-time proposal read this
 * one query, so they cannot disagree about the blast radius.
 */
export function useDbPreviewDescriptions(open: boolean) {
  return useQuery({
    queryKey: ['finance', 'transactions', 'descriptionsForPreview'],
    queryFn: async () => unwrap(await transactionsDescriptionsForPreview()),
    enabled: open,
    staleTime: 60_000,
  });
}
