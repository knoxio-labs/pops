import { skipToken, useQuery } from '@tanstack/react-query';

import { Button } from '@pops/ui';

import type { JSX } from 'react';

import type { ContactReferenceReadResult } from '@pops/pillar-sdk';

import type { SourceContactSession } from './session';

/** Display names and links only after the Contacts owner verifies this retained source reference. */
export function ContactReference({
  session,
  uri,
  label,
}: {
  session: SourceContactSession;
  uri: string;
  label?: string;
}): JSX.Element {
  const reader = session.context.contacts?.readContactReference;
  const query = useQuery({
    queryKey: ['source-contact', session.id, uri],
    queryFn: reader ? ({ signal }) => reader(uri, { signal }) : skipToken,
    retry: false,
  });
  const result = reader && !query.isError ? query.data : undefined;
  return (
    <div className="min-w-0 space-y-1">
      {result?.status === 'available' ? (
        <Button asChild variant="link" className="min-h-11 h-auto whitespace-normal p-0 text-left">
          <a href={result.href}>{result.name}</a>
        </Button>
      ) : (
        <p role={query.isError ? 'alert' : 'status'} className="text-sm text-muted-foreground">
          {query.isError
            ? 'Contact read failed'
            : resultLabel(result?.status, reader !== undefined && query.isFetching)}
        </p>
      )}
      <ReferenceDetails uri={uri} label={label} />
      {canRetry(query.isError, result) && (
        <Button variant="ghost" className="min-h-11" onClick={() => void query.refetch()}>
          Retry contact read
        </Button>
      )}
    </div>
  );
}
function resultLabel(
  status: ContactReferenceReadResult['status'] | undefined,
  pending: boolean
): string {
  if (pending) return 'Checking contact…';
  if (status === 'missing') return 'Contact not found';
  if (status === 'unavailable') return 'Contacts unavailable';
  if (status === 'readError') return 'Contact details unavailable';
  return 'Contact not verified';
}

function canRetry(failed: boolean, result: ContactReferenceReadResult | undefined): boolean {
  return failed || result?.status === 'unavailable' || result?.status === 'readError';
}

function ReferenceDetails({ uri, label }: { uri: string; label?: string }): JSX.Element {
  return (
    <details className="text-sm">
      <summary className="min-h-11 cursor-pointer content-center">Reference details</summary>
      <code className="block break-all text-xs text-muted-foreground">{uri}</code>
      {label && <p className="text-xs text-muted-foreground">Source label: {label}</p>}
    </details>
  );
}
