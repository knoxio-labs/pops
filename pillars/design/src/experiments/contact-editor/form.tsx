import { useState } from 'react';

import { Button, ComboboxSelect, TextInput } from '@pops/ui';

import { directoryKinds } from '../contact-directory/model';
import { contactDraftError, resetContactDraft } from './model';
import { ContactSections } from './sections';

import type { ContactDraft, ContactEditorState } from './model';

function initialDraft(draft: ContactDraft, progressive: boolean): ContactDraft {
  if (progressive) return draft;
  return {
    ...draft,
    methods: draft.methods.length
      ? draft.methods
      : [{ id: crypto.randomUUID(), label: '', value: '' }],
    addresses: draft.addresses.length
      ? draft.addresses
      : [{ id: crypto.randomUUID(), label: '', value: '', city: '' }],
  };
}

/** Owns an isolated draft; validation and Cancel never change saved-record history. */
export function ContactForm({
  state,
  progressive,
  save,
}: {
  state: ContactEditorState;
  progressive: boolean;
  save: (draft: ContactDraft) => string | null;
}) {
  const [draft, setDraft] = useState(() => initialDraft(state.draft, progressive));
  const [error, setError] = useState<string | null>(null);
  const [reset, setReset] = useState(0);
  return (
    <form
      noValidate
      className="space-y-5 rounded-xl border border-border bg-card p-4 text-sm md:p-5"
      onSubmit={(event) => {
        event.preventDefault();
        const invalid = contactDraftError(draft);
        setError(invalid ?? save(draft));
      }}
    >
      <IdentityFields draft={draft} update={setDraft} />
      <ContactSections key={reset} draft={draft} update={setDraft} progressive={progressive} />
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <footer className="flex items-center justify-end gap-2 border-t border-border pt-4">
        <Button
          type="button"
          variant="outline"
          className="min-h-11 text-sm"
          onClick={() => {
            setDraft(initialDraft(resetContactDraft(state).draft, progressive));
            setError(null);
            setReset(reset + 1);
          }}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          className="min-h-11 bg-app-accent text-app-accent-foreground text-sm hover:bg-app-accent/90"
        >
          {state.selectedId ? 'Save changes' : 'Create'}
        </Button>
      </footer>
    </form>
  );
}

/** Edits an explicit name and source taxonomy kind without selecting a default type. */
export function IdentityFields({
  draft,
  update,
}: {
  draft: ContactDraft;
  update: (draft: ContactDraft) => void;
}) {
  return (
    <section className="space-y-4" aria-label="Identity">
      <h2 className="text-base font-semibold leading-tight tracking-normal">Identity</h2>
      <TextInput
        label="Name *"
        required
        className="text-sm"
        containerClassName="min-h-11"
        value={draft.name}
        onChange={(event) => update({ ...draft, name: event.target.value })}
      />
      <div className="space-y-1.5">
        <label htmlFor="contact-kind" className="text-xs font-semibold text-muted-foreground">
          Type *
        </label>
        <ComboboxSelect
          id="contact-kind"
          aria-label="Type"
          className="min-h-11 text-sm"
          options={directoryKinds.map(({ kind, label }) => ({ value: kind, label }))}
          placeholder="Select type"
          value={draft.kind}
          onChange={(kind) => {
            if (typeof kind === 'string') update({ ...draft, kind });
          }}
        />
      </div>
    </section>
  );
}
