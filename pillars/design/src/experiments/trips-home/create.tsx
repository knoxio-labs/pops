import { useMemo } from 'react';

import { Button, Dialog, DialogContent, DialogDescription, DialogTitle } from '@pops/ui';

import { ParentField, TagField } from '../trip-settings/associations';
import { SettingsContext } from '../trip-settings/context';
import { DestinationField, NameField, NotesField, WhenField } from '../trip-settings/fields';
import { SettingsIssues } from '../trip-settings/form-parts';
import { homeSettingsState } from './model';

import type { TripSettings } from '../trip-settings/model';
import type { HomeState } from './model';

/** Creates trips through the approved all-fields settings controls and current source catalogues. */
export function NewTripDialog({
  state,
  draft,
  update,
  open,
  setOpen,
  create,
  cancel,
  error,
}: {
  state: HomeState;
  draft: TripSettings;
  update: (draft: TripSettings) => void;
  open: boolean;
  setOpen: (open: boolean) => void;
  create: () => void;
  cancel: () => void;
  error: string | null;
}) {
  const settings = useMemo(() => homeSettingsState(state, draft), [state, draft]);
  const context = useMemo(
    () => ({ state: settings, change: (next: typeof settings) => update(next.trip) }),
    [settings, update]
  );
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-screen overflow-y-auto bg-card">
        <DialogTitle className="text-base font-semibold leading-tight tracking-normal">
          New trip
        </DialogTitle>
        <DialogDescription className="sr-only">
          Set optional trip details and source associations.
        </DialogDescription>
        <SettingsContext.Provider value={context}>
          <CreationForm create={create} cancel={cancel} error={error} />
        </SettingsContext.Provider>
      </DialogContent>
    </Dialog>
  );
}

function CreationForm({
  create,
  cancel,
  error,
}: {
  create: () => void;
  cancel: () => void;
  error: string | null;
}) {
  return (
    <form
      aria-label="New trip"
      noValidate
      className="space-y-4 text-sm"
      onSubmit={(event) => {
        event.preventDefault();
        create();
      }}
    >
      <DestinationField />
      <NameField />
      <WhenField />
      <TagField />
      <ParentField />
      <section className="space-y-2 border-t border-border pt-4">
        <h2 className="text-base font-semibold leading-tight tracking-normal">Notes</h2>
        <NotesField />
      </section>
      <SettingsIssues />
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <footer className="flex justify-end gap-2 border-t border-border pt-4">
        <Button type="button" variant="outline" className="min-h-11 text-sm" onClick={cancel}>
          Cancel
        </Button>
        <Button
          type="submit"
          className="min-h-11 bg-app-accent text-app-accent-foreground text-sm hover:bg-app-accent/90"
        >
          Create trip
        </Button>
      </footer>
    </form>
  );
}
