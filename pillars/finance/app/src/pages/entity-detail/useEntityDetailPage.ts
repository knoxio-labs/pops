import { useQuery } from '@tanstack/react-query';

import { unwrap } from '../../contacts-api-helpers.js';
import { entitiesGet } from '../../contacts-api/index.js';
import { toPageEntity } from '../entities/useEntityAvatarMutations';
import { ENTITIES_KEY, useEntityFormDialog } from '../entities/useEntityFormDialog';

import type { Entity as ContactEntity } from '../../contacts-api/types.gen.js';

/**
 * `/entities/:id` — one entity, read straight from contacts rather than
 * finance's usage-augmented list: `EntityUsageListResponse` doesn't carry
 * `posterAssetId` (only the list's own columns need it today), and a details
 * page for one row is not worth adding it there for.
 */
export function useEntityDetailPage(entityId: string) {
  const query = useQuery({
    queryKey: [...ENTITIES_KEY, 'detail', entityId],
    queryFn: async () => unwrap(await entitiesGet({ path: { id: entityId } })),
    enabled: entityId !== '',
  });
  const formDialog = useEntityFormDialog();

  const entity: ContactEntity | null = query.data?.data ?? null;

  return {
    query,
    entity,
    isLoading: query.isLoading,
    openEdit: () => {
      if (entity) formDialog.handleEdit(toPageEntity(entity));
    },
    ...formDialog,
  };
}
