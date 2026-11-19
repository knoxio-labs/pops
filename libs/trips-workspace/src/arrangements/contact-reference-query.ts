import { queryOptions, skipToken } from '@tanstack/react-query';

import { arrangementsKey } from './api';

import type { ContactReferenceReadResult } from '@pops/pillar-sdk';

import type { ArrangementResponsibilityContext } from './responsibility-context';

type ContactReferenceQueryKey = readonly [
  ...ReturnType<typeof arrangementsKey>,
  'contact-reference',
  string,
];
type ContactReferenceQueryOptions = ReturnType<
  typeof queryOptions<
    ContactReferenceReadResult,
    Error,
    ContactReferenceReadResult,
    ContactReferenceQueryKey
  >
>;
type ContactReferenceReadIdentity = Pick<
  ArrangementResponsibilityContext,
  'tripId' | 'client' | 'contacts'
>;

/** Shared read configuration for all displays of the same opaque contact reference. */
export function contactReferenceQueryOptions(
  identity: ContactReferenceReadIdentity,
  uri: string
): ContactReferenceQueryOptions {
  const reader = identity.contacts?.readContactReference;
  return queryOptions({
    queryKey: [...arrangementsKey(identity), 'contact-reference', uri] as const,
    queryFn: reader ? ({ signal }) => reader(uri, { signal }) : skipToken,
    retry: false,
  });
}
