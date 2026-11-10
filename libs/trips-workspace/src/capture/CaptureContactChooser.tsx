import { useSyncExternalStore } from 'react';

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
  const Chooser = choice.chooser.Chooser;
  return (
    <>
      <Chooser
        key={choice.id}
        open={choice.open}
        onOpenChange={(open) => contacts.changeOpen(open)}
        onSelect={(selection) => contacts.accept(choice.id, selection)}
      />
      {choice.selected !== null && !choice.applied ? (
        <section role="status" className="space-y-2 rounded-md border border-border p-3">
          <p>{choice.selected.name} is retained.</p>
          <p>
            {choice.linking
              ? 'Linking the selected contact…'
              : (choice.linkError ?? 'The Trips link has not been confirmed.')}
          </p>
          <p className="break-words text-sm text-muted-foreground">
            {choice.selected.reference.uri}
          </p>
          <Button disabled={choice.linking} onClick={() => void contacts.applySelection()}>
            Retry linking selected contact
          </Button>
          {choice.intent.kind !== 'capture' ? (
            <Button disabled={choice.linking} onClick={() => contacts.restoreSelection()}>
              Restore selected link to draft
            </Button>
          ) : null}
          <Button disabled={choice.linking} onClick={() => contacts.chooseAnother()}>
            Choose another contact
          </Button>
        </section>
      ) : null}
    </>
  );
}
