import { useQuery } from '@tanstack/react-query';

import { ContactError } from '../errors';

import type { ContactCreationGateway } from './api';

/** Load authoritative choices/default and reject a malformed catalogue instead of inventing a fallback. */
export function useEntityCatalogue(gateway: ContactCreationGateway) {
  return useQuery({
    queryKey: ['contacts-entity-catalogue'],
    queryFn: async () => {
      const data = await gateway.catalogue();
      if (!Array.isArray(data.types) || !data.types.includes(data.defaultType)) {
        throw new ContactError('invalidResponse', 'contacts.catalogue.invalid');
      }
      return data;
    },
    retry: false,
    refetchOnWindowFocus: false,
  });
}
