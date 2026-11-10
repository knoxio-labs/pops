import { useEffect, useSyncExternalStore } from 'react';

import { Button } from '@pops/ui';

import type { JSX } from 'react';

import type { CaptureBrowserSession } from './browser-session';
import type { CaptureContactRead } from './contact-reference-reads';

const statusText: Record<Exclude<CaptureContactRead['status'], 'available'>, string> = {
  unverified: 'Contact has not been verified.',
  loading: 'Reading Contact…',
  missing: 'Contact is missing.',
  unavailable: 'Contacts is unavailable.',
  readError: 'Contact could not be read.',
};

/** Display only owner-verified metadata and navigation while retaining the original Trips reference verbatim. */
export function CaptureContactReference({
  session,
  reference,
}: {
  session: CaptureBrowserSession;
  reference: { uri: string; label?: string };
}): JSX.Element {
  const reads = session.contactReads;
  const value = useSyncExternalStore(reads.subscribe, () => reads.snapshot(reference.uri));
  useEffect(() => {
    void reads.load(reference.uri);
  }, [reads, reference.uri]);
  return (
    <span className="inline-flex flex-wrap items-center gap-2 text-sm" title={reference.uri}>
      {value.status === 'available' ? (
        <>
          <Button asChild variant="link">
            <a href={value.href}>{value.name}</a>
          </Button>
          <Button variant="ghost" onClick={() => void reads.load(reference.uri, true)}>
            Refresh Contact
          </Button>
        </>
      ) : (
        <>
          <span className="break-all">
            {reads.lastAvailable(reference.uri)?.name ?? reference.label ?? reference.uri}
          </span>
          <span className="text-muted-foreground">{statusText[value.status]}</span>
          {value.status === 'missing' ||
          value.status === 'unavailable' ||
          value.status === 'readError' ? (
            <Button variant="ghost" onClick={() => void reads.load(reference.uri, true)}>
              Retry Contact read
            </Button>
          ) : null}
        </>
      )}
    </span>
  );
}
