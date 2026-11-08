import { CopyContact } from '../contact-person-detail/copy-contact';

import type { DirectoryContact } from './model';

function ContactMethods({ contact }: { contact: DirectoryContact }) {
  if (!contact.methods.length) return null;
  return (
    <section
      aria-label="Contact methods"
      className="divide-y divide-foreground/15 overflow-hidden rounded-xl border border-foreground/15 bg-muted"
    >
      {contact.methods.map((method) => (
        <div key={method.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="mb-1 text-xs font-medium text-muted-foreground">{method.label}</p>
            <p className="break-words text-base font-medium leading-snug">{method.value}</p>
          </div>
          <CopyContact value={method.value} label={`Copy ${method.label}: ${method.value}`} />
        </div>
      ))}
    </section>
  );
}

function ContactAddresses({ contact }: { contact: DirectoryContact }) {
  return (
    <>
      {contact.addresses.map((address) => (
        <section
          key={address.id}
          aria-label={`${address.label} address`}
          className="rounded-xl border border-foreground/15 bg-muted px-4 py-3"
        >
          <p className="mb-1 text-xs font-medium text-muted-foreground">{address.label}</p>
          <p className="whitespace-pre-wrap break-words text-base leading-snug">{address.value}</p>
          {address.city && (
            <p className="mt-1 break-words text-base leading-snug">{address.city}</p>
          )}
        </section>
      ))}
    </>
  );
}

function ContactNotes({ contact }: { contact: DirectoryContact }) {
  if (!contact.notes) return null;
  return (
    <section
      aria-label="Contact notes"
      className="rounded-xl border border-foreground/15 bg-muted px-4 py-3"
    >
      <h2 className="mb-1 text-xs font-medium text-muted-foreground">Notes</h2>
      <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{contact.notes}</p>
    </section>
  );
}

/** Group real contact facts in a bounded reading column; empty fields add no placeholder prose. */
export function DirectoryDetails({ contact }: { contact: DirectoryContact }) {
  return (
    <section aria-label={`Details for ${contact.name}`} className="px-4 pb-5">
      <div className="mx-auto max-w-lg space-y-3">
        <ContactMethods contact={contact} />
        <ContactAddresses contact={contact} />
        {contact.aliases.length > 0 && (
          <section
            aria-label="Contact aliases"
            className="rounded-xl border border-foreground/15 bg-muted px-4 py-3"
          >
            <h2 className="mb-1 text-xs font-medium text-muted-foreground">Aliases</h2>
            <p className="break-words text-base">{contact.aliases.join(', ')}</p>
          </section>
        )}
        <ContactNotes contact={contact} />
        {contact.legacy?.abn && (
          <section
            aria-label="Business number"
            className="rounded-xl border border-foreground/15 bg-muted px-4 py-3"
          >
            <h2 className="mb-1 text-xs font-medium text-muted-foreground">ABN</h2>
            <p className="break-words text-base">{contact.legacy.abn}</p>
          </section>
        )}
        <p className="px-1 pt-1 text-xs text-muted-foreground">Source · {contact.origin}</p>
      </div>
    </section>
  );
}
