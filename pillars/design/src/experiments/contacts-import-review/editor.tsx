import { useState } from 'react';

import { Button, Card, CardContent, PageHeader, TextInput } from '@pops/ui';

import type { ScreenStates } from '@/contract';

type EditorLayout = 'sections' | 'compact';

/** Contact editing alternatives preserve repeatable contact points and existing values. */
export function ContactEditor({
  layout,
  failed = false,
  creating = false,
}: {
  layout: EditorLayout;
  failed?: boolean;
  creating?: boolean;
}) {
  const [saved, setSaved] = useState(false);
  const [emails, setEmails] = useState(
    creating
      ? [{ id: 'email-1', value: '' }]
      : [
          { id: 'email-1', value: 'mira@example.test' },
          { id: 'email-2', value: 'mira.work@example.test' },
        ]
  );
  return (
    <form
      className="mx-auto max-w-4xl space-y-6 p-6"
      onSubmit={(event) => {
        event.preventDefault();
        setSaved(true);
      }}
    >
      <PageHeader
        title={creating ? 'New person' : 'Edit Mira Shah'}
        description="Personal details belong to this person. Imported source details remain traceable."
        actions={<Button type="submit">Save person</Button>}
      />
      {failed && (
        <p role="alert" className="text-destructive">
          Could not save. Your changes are still here. Try again.
        </p>
      )}
      {saved && (
        <p role="status" className="text-success">
          Person saved.
        </p>
      )}
      <div className={layout === 'compact' ? 'grid gap-6 md:grid-cols-2' : 'space-y-6'}>
        <IdentityFields creating={creating} />
        <ContactFields
          emails={emails}
          addEmail={() =>
            setEmails((previous) => [
              ...previous,
              { id: `email-${previous.length + 1}`, value: '' },
            ])
          }
          creating={creating}
        />
      </div>
      <Button type="reset" variant="ghost" onClick={() => setSaved(false)}>
        Cancel changes
      </Button>
    </form>
  );
}

/** Editor failure, creation and alternate arrangement are reviewable by URL. */
export const editorStates: ScreenStates = {
  error: () => <ContactEditor layout="sections" failed />,
  empty: () => <ContactEditor layout="sections" creating />,
  compact: () => <ContactEditor layout="compact" />,
};

function IdentityFields({ creating }: { creating: boolean }) {
  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <h2 className="font-semibold">Identity</h2>
        <TextInput label="Given name" defaultValue={creating ? '' : 'Mira'} required />
        <TextInput label="Family name" defaultValue={creating ? '' : 'Shah'} />
        <TextInput label="Display name" defaultValue={creating ? '' : 'Mira Shah'} />
        <TextInput label="Organisation" defaultValue={creating ? '' : 'Fern Studio'} />
      </CardContent>
    </Card>
  );
}

function ContactFields({
  emails,
  addEmail,
  creating,
}: {
  emails: { id: string; value: string }[];
  addEmail: () => void;
  creating: boolean;
}) {
  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <h2 className="font-semibold">Contact details</h2>
        {emails.map((email, index) => (
          <TextInput
            key={email.id}
            label={`Email ${index + 1}`}
            type="email"
            defaultValue={email.value}
          />
        ))}
        <Button type="button" variant="outline" onClick={addEmail}>
          Add email
        </Button>
        <TextInput label="Mobile phone" defaultValue={creating ? '' : '+61 400 000 011'} />
        <TextInput
          label="Postal address"
          defaultValue={creating ? '' : '12 Example Lane, Sampletown'}
        />
        <p className="text-xs text-muted-foreground">
          Google · imported 24 October. Saving edits does not write back to the provider.
        </p>
      </CardContent>
    </Card>
  );
}
