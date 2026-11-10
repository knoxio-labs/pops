import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { usePersonWrites } from './usePersonWrites';

import type { PersonGateway, PersonSnapshot } from './contracts';
import type { PersonDraft } from './draft';

/** Load atomic facts without replacing unsaved drafts and apply only acknowledged mutation or undo receipts. */
export function usePerson(id: string, gateway: PersonGateway) {
  const key = ['contacts-person', id];
  const [ownOperations, setOwnOperations] = useState<string[]>([]);
  const client = useQueryClient();
  const query = useQuery({
    queryKey: key,
    queryFn: () => gateway.load(id),
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const writes = usePersonWrites(query.data, query.isFetching || query.isError, (accept) => {
    client.setQueryData<PersonSnapshot>(key, (previous) =>
      previous ? accept(previous) : previous
    );
  });
  async function reload() {
    if (writes.isWriting()) return;
    const result = await query.refetch();
    if (result.isError) writes.setError(result.error);
    if (result.isSuccess) writes.reset();
  }
  const data = query.data;
  const undoable = data?.operations.findLast(
    (operation) => operation.canUndo && ownOperations.includes(operation.id)
  );
  return {
    ...query,
    error: writes.error ?? query.error,
    saving: writes.saving,
    uncertain: writes.uncertain,
    success: writes.success,
    reload,
    canUndo: undoable !== undefined,
    save: (draft: PersonDraft, before?: PersonSnapshot) =>
      writes.write(
        (personId) => {
          if (!data) throw new Error('Person not loaded');
          return gateway.save(personId, draft, before ?? data);
        },
        (previous, receipt) => {
          setOwnOperations((operations) => [...operations, receipt.operation.id]);
          return { ...previous, ...receipt.data };
        }
      ),
    undo: () =>
      writes.write(
        (personId) => {
          if (!data || !undoable) throw new Error('No person operation to undo');
          return gateway.undo(personId, undoable.id, data.version);
        },
        (previous, receipt) => {
          setOwnOperations((operations) =>
            operations.filter((operation) => operation !== receipt.operation.undoneOperationId)
          );
          return { ...previous, ...receipt.data };
        }
      ),
  };
}
