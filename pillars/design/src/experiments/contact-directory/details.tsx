import { MapPin, ContactRound } from 'lucide-react';

import { Badge } from '@pops/ui';

import { CopyContact } from '../contact-person-detail/copy-contact';

import type { DirectoryContact } from './model';

/** Expand source contact facts in place without navigating away or inferring missing information. */
export function DirectoryDetails({ contact }: { contact: DirectoryContact }) {
  return (
    <section
      aria-label={`Details for ${contact.name}`}
      className="space-y-3 border-t border-foreground/20 px-4 py-3"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">Source</span>
        <Badge variant="outline">{contact.origin}</Badge>
      </div>
      {contact.aliases.length > 0 && (
        <p className="text-sm">
          <span className="text-muted-foreground">Aliases · </span>
          {contact.aliases.join(', ')}
        </p>
      )}
      {contact.methods.map((method) => (
        <div key={method.id} className="flex items-center gap-2 text-sm">
          <ContactRound className="size-4 shrink-0 text-app-accent" />
          <span className="min-w-0 flex-1 break-words">
            <span className="text-xs text-muted-foreground">{method.label} · </span>
            {method.value}
          </span>
          <CopyContact value={method.value} />
        </div>
      ))}
      {contact.addresses.map((address) => (
        <div key={address.id} className="flex gap-2 text-sm">
          <MapPin className="mt-1 size-4 shrink-0 text-app-accent" />
          <div>
            <p className="text-xs text-muted-foreground">{address.label}</p>
            <p>{address.value}</p>
            {address.city && <p className="text-muted-foreground">{address.city}</p>}
          </div>
        </div>
      ))}
      {contact.notes && <p className="whitespace-pre-wrap text-sm">{contact.notes}</p>}
      {contact.legacy?.abn && (
        <p className="text-sm">
          <span className="text-muted-foreground">ABN · </span>
          {contact.legacy.abn}
        </p>
      )}
    </section>
  );
}
