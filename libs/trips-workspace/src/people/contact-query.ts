import type { UseQueryOptions } from '@tanstack/react-query';

import type { MeetingContact, PeopleWorkspaceProps } from './types';

/** Read only through the shared owner capability; React Query cancellation reaches the owner's actual requests. */
export function meetingContactQuery(
  contacts: PeopleWorkspaceProps['contacts'],
  uri: string | null
): UseQueryOptions<
  MeetingContact,
  Error,
  MeetingContact,
  readonly ['meeting-contact', string | null]
> {
  return {
    queryKey: ['meeting-contact', uri],
    queryFn: ({ signal }) =>
      uri && contacts?.readContactReference
        ? contacts.readContactReference(uri, { signal })
        : Promise.resolve({ status: 'unverified' }),
    enabled: uri !== null && contacts?.readContactReference !== undefined,
    retry: false,
  };
}
