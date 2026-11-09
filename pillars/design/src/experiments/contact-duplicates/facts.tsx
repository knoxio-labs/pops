import { directoryKinds } from '../contact-directory/model';

import type { DirectoryContact } from '../contact-directory/model';

/** Readable source taxonomy labels without collapsing distinct contact kinds. */
export function contactKindLabel(kind: DirectoryContact['kind']): string {
  return directoryKinds.find((item) => item.kind === kind)?.label ?? kind;
}

/** Displays a source contact's recorded optional facts without inferring missing fields. */
export function ContactFacts({ contact }: { contact: DirectoryContact }) {
  return (
    <div className="space-y-4 text-sm">
      {contact.aliases.length > 0 && (
        <FactGroup label="Aliases">{contact.aliases.join(' · ')}</FactGroup>
      )}
      {contact.methods.length > 0 && (
        <FactGroup label="Contact methods">
          <ul className="space-y-2">
            {contact.methods.map((method) => (
              <li key={method.id} className="break-words">
                {method.label && <span className="mr-2 text-muted-foreground">{method.label}</span>}
                {method.value}
              </li>
            ))}
          </ul>
        </FactGroup>
      )}
      {contact.addresses.length > 0 && (
        <FactGroup label="Addresses">
          <ul className="space-y-2">
            {contact.addresses.map((address) => (
              <li key={address.id} className="break-words">
                {address.label && (
                  <span className="mr-2 text-muted-foreground">{address.label}</span>
                )}
                {[address.value, address.city].filter(Boolean).join(' · ')}
              </li>
            ))}
          </ul>
        </FactGroup>
      )}
      {contact.notes && (
        <FactGroup label="Notes">
          <p className="whitespace-pre-wrap">{contact.notes}</p>
        </FactGroup>
      )}
    </div>
  );
}

/** Consistent compact labels keep source provenance separate from the recorded value. */
export function FactGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      {children}
    </div>
  );
}

/** Stacks every candidate's identity and facts; source numbers are stable across all projections. */
export function DuplicateSourceCards({ contacts }: { contacts: DirectoryContact[] }) {
  return (
    <section aria-label="Source contacts" className="space-y-3">
      <h2 className="text-base font-semibold leading-tight tracking-normal">Source contacts</h2>
      {contacts.map((contact, index) => (
        <article
          key={contact.id}
          aria-label={`Contact ${index + 1}: ${contact.name}`}
          className="space-y-4 rounded-xl border border-border bg-card p-4"
        >
          <header className="space-y-1">
            <p className="text-xs text-muted-foreground">Contact {index + 1}</p>
            <h3 className="break-words text-base font-semibold leading-tight tracking-normal">
              {contact.name}
            </h3>
            <p className="text-sm text-muted-foreground">{contactKindLabel(contact.kind)}</p>
          </header>
          <ContactFacts contact={contact} />
          <p className="border-t border-border pt-3 text-xs text-muted-foreground">
            Source: {contact.origin}
            {contact.legacy ? ' · Original Finance identity retained' : ''}
          </p>
        </article>
      ))}
    </section>
  );
}
