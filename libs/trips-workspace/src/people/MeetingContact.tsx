import { useQuery } from '@tanstack/react-query';
import { ExternalLink, UserRound, UserRoundX } from 'lucide-react';

import { Button } from '@pops/ui';

import type { JSX } from 'react';

import type { PeopleWorkspaceProps } from './types';

interface MeetingContactProps extends Pick<PeopleWorkspaceProps, 'resolveContact' | 'text'> {
  uri: string | null;
  choose: () => void;
  clear: () => void;
  canChoose: boolean;
}
/** Resolve retained identities through the owner; a failed read stays unverified and still permits clear/edit. */
export function MeetingContact({
  uri,
  resolveContact,
  text,
  choose,
  clear,
  canChoose,
}: MeetingContactProps): JSX.Element {
  const source = useQuery({
    queryKey: ['meeting-contact', uri],
    queryFn: () =>
      uri && resolveContact
        ? resolveContact(uri)
        : Promise.resolve({ status: 'unverified' as const }),
    enabled: uri !== null,
    retry: false,
  });
  const contact = source.data;
  const name = contactName(uri, contact, text);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {uri === null ? (
          <UserRoundX aria-hidden className="size-4 text-muted-foreground" />
        ) : (
          <UserRound aria-hidden className="size-4 text-app-accent" />
        )}
        <span className="min-w-0 break-words text-sm font-medium">{name}</span>
        {contact?.status === 'available' && (
          <Button asChild variant="ghost" className="min-h-11">
            <a href={contact.href} aria-label={text('openContact')}>
              <ExternalLink aria-hidden className="size-4" />
            </a>
          </Button>
        )}
        <Button variant="ghost" className="min-h-11" onClick={choose} disabled={!canChoose}>
          {text('chooseContact')}
        </Button>
        {uri !== null && (
          <Button variant="ghost" className="min-h-11" onClick={clear}>
            {text('clearContact')}
          </Button>
        )}
        {source.isError && (
          <Button variant="ghost" className="min-h-11" onClick={() => void source.refetch()}>
            {text('retry')}
          </Button>
        )}
      </div>
      {uri !== null && contact?.status !== 'available' && (
        <p className="break-all text-xs text-muted-foreground">{uri}</p>
      )}
      {source.isError && (
        <p role="alert" className="text-sm text-destructive">
          {text('failed')} <code>trips.contact.read</code>
        </p>
      )}
    </div>
  );
}

function contactName(
  uri: string | null,
  contact:
    | Awaited<ReturnType<NonNullable<PeopleWorkspaceProps['resolveContact']>>>
    | null
    | undefined,
  text: PeopleWorkspaceProps['text']
): string {
  if (uri === null) return text('contactCleared');
  if (contact?.status === 'available') return contact.name;
  return text(contact?.status === 'unavailable' ? 'contactUnavailable' : 'contactUnverified');
}
