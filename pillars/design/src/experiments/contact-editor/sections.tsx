import { Plus } from 'lucide-react';
import { useState } from 'react';

import { Button, ChipInput, Textarea } from '@pops/ui';

import { ContactRows } from './fields';

import type { ContactDraft } from './model';

const sections = [
  { key: 'methods', title: 'Contact methods' },
  { key: 'addresses', title: 'Addresses' },
  { key: 'aliases', title: 'Aliases' },
  { key: 'notes', title: 'Notes' },
] as const;

type SectionKey = (typeof sections)[number]['key'];

const addLabel: Record<SectionKey, string> = {
  methods: 'contact method',
  addresses: 'address',
  aliases: 'aliases',
  notes: 'notes',
};

function SectionFields({
  section,
  draft,
  update,
}: {
  section: SectionKey;
  draft: ContactDraft;
  update: (draft: ContactDraft) => void;
}) {
  if (section === 'methods' || section === 'addresses') {
    return <ContactRows draft={draft} update={update} section={section} />;
  }
  if (section === 'aliases') {
    return (
      <ChipInput
        aria-label="Aliases"
        placeholder="Add an alias and press Enter"
        className="text-sm"
        containerClassName="min-h-11"
        value={draft.aliases}
        onChange={(aliases) => update({ ...draft, aliases })}
      />
    );
  }
  return (
    <Textarea
      aria-label="Notes"
      className="min-h-24 text-sm"
      value={draft.notes}
      onChange={(event) => update({ ...draft, notes: event.target.value })}
    />
  );
}

/** Reveals optional fields in place, retaining every populated source section on edit. */
export function ContactSections({
  draft,
  update,
  progressive,
}: {
  draft: ContactDraft;
  update: (draft: ContactDraft) => void;
  progressive: boolean;
}) {
  const [revealed, setRevealed] = useState<SectionKey[]>(() =>
    sections.filter(({ key }) => !progressive || draft[key].length > 0).map(({ key }) => key)
  );
  return (
    <>
      {sections.map(({ key, title }) =>
        revealed.includes(key) ? (
          <section key={key} aria-label={title} className="space-y-3 border-t border-border pt-5">
            <h2 className="text-base font-semibold leading-tight tracking-normal">{title}</h2>
            <SectionFields section={key} draft={draft} update={update} />
          </section>
        ) : null
      )}
      {sections.some(({ key }) => !revealed.includes(key)) && (
        <div
          className="flex flex-wrap gap-2 border-t border-border pt-4"
          aria-label="Add optional sections"
        >
          {sections
            .filter(({ key }) => !revealed.includes(key))
            .map(({ key }) => (
              <Button
                key={key}
                type="button"
                variant="outline"
                className="min-h-11 text-sm text-app-accent"
                onClick={() => {
                  setRevealed([...revealed, key]);
                  if (key === 'methods' && draft.methods.length === 0)
                    update({
                      ...draft,
                      methods: [{ id: crypto.randomUUID(), label: '', value: '' }],
                    });
                  if (key === 'addresses' && draft.addresses.length === 0)
                    update({
                      ...draft,
                      addresses: [{ id: crypto.randomUUID(), label: '', value: '', city: '' }],
                    });
                }}
              >
                <Plus className="size-4" aria-hidden /> Add {addLabel[key]}
              </Button>
            ))}
        </div>
      )}
    </>
  );
}
