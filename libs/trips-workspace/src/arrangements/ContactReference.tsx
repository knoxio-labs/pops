import { skipToken, useQuery } from '@tanstack/react-query';

import { Button } from '@pops/ui';

import { arrangementsKey } from './api';

import type { JSX } from 'react';

import type { ContactReferenceReadResult } from '@pops/pillar-sdk';

import type { ArrangementResponsibilityContext } from './responsibility-context';

/** Read display facts only through the owner capability; unresolved identities remain clearable opaque source values. */
export function ContactReference({
  identity,
  uri,
  interactive = false,
}: {
  identity: ArrangementResponsibilityContext;
  uri: string;
  interactive?: boolean;
}): JSX.Element {
  const reader = identity.contacts?.readContactReference;
  const query = useQuery<ContactReferenceReadResult>({
    queryKey: [...arrangementsKey(identity), 'contact-reference', uri],
    queryFn: reader ? ({ signal }) => reader(uri, { signal }) : skipToken,
    retry: false,
  });
  if (query.isError) return <span>{identity.labels.contactReadError}</span>;
  const result = reader ? query.data : undefined;
  if (result?.status === 'available')
    return interactive ? (
      <Button asChild variant="link" className="min-h-11 h-auto whitespace-normal p-0 text-left">
        <a href={result.href}>{result.name}</a>
      </Button>
    ) : (
      <span>{result.name}</span>
    );
  return <span>{contactLabel(result?.status, identity.labels)}</span>;
}
function contactLabel(
  status: Exclude<ContactReferenceReadResult['status'], 'available'> | undefined,
  labels: ArrangementResponsibilityContext['labels']
): string {
  switch (status) {
    case 'missing':
      return labels.contactMissing;
    case 'unavailable':
      return labels.contactsUnavailable;
    case 'readError':
      return labels.contactReadError;
    default:
      return labels.contactReference;
  }
}

/** Opaque source identity is a detail, independently available without a Contact catalogue request. */
export function ReferenceDetails({
  identity,
  value,
}: {
  identity: ArrangementResponsibilityContext;
  value: string | number;
}): JSX.Element {
  return (
    <details className="text-sm">
      <summary className="min-h-11 cursor-pointer content-center">
        {identity.labels.referenceDetails}
      </summary>
      <code className="block break-all text-xs text-muted-foreground">{value}</code>
    </details>
  );
}
