import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';

import { unwrap } from '../../contacts-api-helpers.js';
import { entitiesDelete } from '../../contacts-api/index.js';
import { unwrap as unwrapFinance } from '../../finance-api-helpers.js';
import { entityUsageList } from '../../finance-api/index.js';
import { fetchAllPages } from '../../lib/fetch-all-pages';
import { ENTITIES_KEY, useEntityFormDialog } from './useEntityFormDialog';

interface DeleteEntityInput {
  id: string;
}

function useDeleteEntityMutation(setDeletingId: (id: string | null) => void) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: DeleteEntityInput) =>
      unwrap(await entitiesDelete({ path: { id: input.id } })),
    onSuccess: () => {
      toast.success('Entity deleted');
      setDeletingId(null);
    },
    onError: (err: Error) => toast.error(err.message),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ENTITIES_KEY }),
  });
}

/**
 * `/entities` — the entity management list (POPS-3067's entity CRUD, still
 * living in finance's app pending that pillar split). The list (with
 * per-entity `transactionCount` + the orphaned filter) is the finance-owned
 * usage rollup; contacts' plain entities CRUD carries neither, which is why
 * this reads `entityUsageList` rather than `entitiesList`.
 */
export function useEntitiesPage() {
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showOrphanedOnly, setShowOrphanedOnly] = useState(false);

  const orphanedOnly = showOrphanedOnly ? ('true' as const) : undefined;
  const query = useQuery({
    queryKey: [...ENTITIES_KEY, 'list', 'all', { orphanedOnly }],
    queryFn: async () =>
      fetchAllPages(async (page) =>
        unwrapFinance(await entityUsageList({ query: { ...page, orphanedOnly } }))
      ),
  });
  const deleteMutation = useDeleteEntityMutation(setDeletingId);
  const formDialog = useEntityFormDialog();

  return {
    query,
    deletingId,
    setDeletingId,
    showOrphanedOnly,
    setShowOrphanedOnly,
    deleteMutation,
    ...formDialog,
  };
}
