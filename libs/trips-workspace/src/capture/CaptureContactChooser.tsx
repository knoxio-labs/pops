import { useSyncExternalStore } from 'react';

import { ContactChooser } from '@pops/app-contacts';
import { Button } from '@pops/ui';

import type { JSX } from 'react';

import type { CaptureBrowserSession } from './browser-session';

/** Mount the owner-localized chooser above filtered rows and retain canonical selections after source-link failures. */
export function CaptureContactChooser({
  session,
}: {
  session: CaptureBrowserSession;
}): JSX.Element | null {
  const contacts = session.contacts;
  const choice = useSyncExternalStore(contacts.subscribe, contacts.snapshot, contacts.snapshot);
  if (choice === null) return null;
  return (
    <>
      <ContactChooser
        key={choice.id}
        session={choice.session}
        open={choice.open}
        onOpenChange={(open) => contacts.changeOpen(open)}
        onSelect={(entity, reference) => contacts.accept(choice.id, entity, reference)}
      />
      {choice.selected !== null && !choice.applied ? (
        <section role="status" className="space-y-2 rounded-md border border-border p-3">
          <p>{choice.selected.name} is retained. The owning Trips source is unavailable.</p>
          <p className="break-words text-sm text-muted-foreground">
            {choice.selected.reference.uri}
          </p>
          <Button onClick={() => contacts.applySelection()}>Retry linking selected contact</Button>
        </section>
      ) : null}
    </>
  );
}
