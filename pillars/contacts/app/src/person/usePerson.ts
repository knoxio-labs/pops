import { useQuery, useQueryClient } from '@tanstack/react-query';

import { usePersonWrites } from './usePersonWrites';

import type { ContactPointInput } from '../contacts-api/types.gen';
import type { PersonDraft, PersonGateway, PersonSnapshot } from './contracts';

/** Load the person without background replacement of unsaved edits and apply acknowledged write receipts. */
export function usePerson(id: string, gateway: PersonGateway) {
  const key = ['contacts-person', id];
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
  return {
    ...query,
    error: writes.error ?? query.error,
    saving: writes.saving,
    uncertain: writes.uncertain,
    success: writes.success,
    reload,
    save: (draft: PersonDraft) =>
      writes.write(
        (personId) => gateway.save(personId, draft),
        (previous, entity) => ({ ...previous, entity })
      ),
    addPoint: (point: ContactPointInput) =>
      writes.write(
        (personId) => gateway.addPoint(personId, point),
        (previous, receipt) => ({ ...previous, points: [...previous.points, receipt] })
      ),
    addAddress: (value: string) =>
      writes.write(
        (personId) => gateway.addAddress(personId, value),
        (previous, receipt) => ({ ...previous, addresses: [...previous.addresses, receipt] })
      ),
  };
}
