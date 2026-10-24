import { Button, DialogFooter, TextInput } from '@pops/ui';

import { connectionCopy, type ConnectionState, type ContactProvider } from './connection-model';

interface ConnectionFormProps {
  provider: ContactProvider;
  condition: ConnectionState;
  onSubmit: () => void;
  onCancel: () => void;
}

/** Shows read-only Google consent or iCloud app-password setup inside the dialog. */
export function ConnectionForm({ provider, condition, onSubmit, onCancel }: ConnectionFormProps) {
  return (
    <form
      className="space-y-5"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      {condition !== 'disconnected' && (
        <p role="status" className="text-base leading-7">
          {connectionCopy[condition].message}
        </p>
      )}
      {provider === 'iCloud' ? (
        <>
          <TextInput
            label="Apple account email"
            type="email"
            autoComplete="username"
            required
            disabled={condition === 'loading'}
          />
          <TextInput
            label="App-specific password"
            type="password"
            autoComplete="off"
            required
            disabled={condition === 'loading'}
          />
          <p className="text-sm leading-6 text-foreground/85">
            Create an app-specific password in your Apple account settings to connect iCloud
            Contacts.
          </p>
        </>
      ) : (
        <p className="rounded-xl border border-border bg-muted/30 p-5 text-base leading-7">
          Choose your Google account in the next step and allow read-only access to its contacts.
        </p>
      )}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={condition === 'loading'}>
          {provider === 'Google' ? 'Continue with Google' : 'Connect iCloud'}
        </Button>
      </DialogFooter>
    </form>
  );
}
