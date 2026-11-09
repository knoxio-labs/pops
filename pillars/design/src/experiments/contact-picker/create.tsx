import { Button } from '@pops/ui';

import { IdentityFields } from '../contact-editor/form';
import { ContactSections } from '../contact-editor/sections';

import type { PickerSession } from './session';

/** Reuses the contact editor's explicit fields; creation and linking occur in one validated local action. */
export function PickerCreate({ session }: { session: PickerSession }) {
  return (
    <form
      noValidate
      className="space-y-5"
      onSubmit={(event) => {
        event.preventDefault();
        session.create();
      }}
    >
      <h3 className="text-base font-semibold leading-tight tracking-normal">New contact</h3>
      <IdentityFields draft={session.draft} update={session.setDraft} />
      <ContactSections draft={session.draft} update={session.setDraft} progressive />
      {session.error && (
        <p role="alert" className="text-sm text-destructive">
          {session.error}
        </p>
      )}
      <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
        <Button
          type="button"
          variant="outline"
          className="min-h-11 text-sm"
          onClick={session.cancelCreation}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          className="min-h-11 bg-app-accent text-app-accent-foreground text-sm hover:bg-app-accent/90"
        >
          Create and link
        </Button>
      </div>
    </form>
  );
}
