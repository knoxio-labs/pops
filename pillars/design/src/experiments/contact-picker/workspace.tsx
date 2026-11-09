import { RotateCcw, UsersRound } from 'lucide-react';

import {
  Button,
  Chip,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  Textarea,
  TextInput,
} from '@pops/ui';

import { PickerCreate } from './create';
import { pickerIdentityLabel } from './identity';
import { PickerReview } from './review';
import { PickerSearch } from './search';
import { useContactPicker } from './session';

import type { PickerScenario } from './model';
import type { PickerSession } from './session';

/** Compares inline and dialog contact selection while keeping the surrounding event draft intact. */
export function ContactPickerWorkspace({
  layout,
  scenario = 'default',
}: {
  layout: 'inline' | 'dialog';
  scenario?: PickerScenario;
}) {
  const session = useContactPicker(scenario);
  return (
    <div className="min-h-screen bg-background text-foreground">
      <PickerReview layout={layout} />
      <main className="mx-auto max-w-xl space-y-5 px-4 py-6 text-sm md:py-8">
        <div className="flex items-center justify-between gap-4">
          <span className="text-xs text-muted-foreground">Trips</span>
          <Button
            variant="ghost"
            className="min-h-11 text-sm"
            disabled={!session.canUndo}
            onClick={session.undo}
          >
            <RotateCcw className="size-4" aria-hidden /> Undo
          </Button>
        </div>
        <h1 className="text-2xl font-semibold leading-tight tracking-normal">Edit event</h1>
        <TaskFields session={session} />
        <ContactSelection session={session} layout={layout} />
        {layout === 'dialog' && <DialogPicker session={session} />}
      </main>
    </div>
  );
}

function ContactSelection({
  session,
  layout,
}: {
  session: PickerSession;
  layout: 'inline' | 'dialog';
}) {
  return (
    <section
      aria-label="Contacts"
      className="space-y-4 rounded-xl border border-border bg-card p-4"
    >
      <h2 className="text-base font-semibold leading-tight tracking-normal">Contacts</h2>
      <div className="flex flex-wrap gap-2">
        {session.state.linkedIds.map((id) => {
          const label = pickerIdentityLabel(session.state, id);
          return (
            <Chip
              key={id}
              removable
              variant="outline"
              className="min-h-11 text-sm"
              removeLabel={`Remove ${label}`}
              onRemove={() => session.unlink(id)}
            >
              {label}
            </Chip>
          );
        })}
      </div>
      <Button
        variant="outline"
        className="min-h-11 text-sm text-app-accent"
        onClick={() => session.setOpen(true)}
      >
        <UsersRound className="size-4" aria-hidden /> Choose contacts
      </Button>
      {layout === 'inline' && session.open && <InlinePicker session={session} />}
    </section>
  );
}

function TaskFields({ session }: { session: PickerSession }) {
  return (
    <section
      aria-label="Event draft"
      className="space-y-4 rounded-xl border border-border bg-card p-4"
    >
      <TextInput
        label="Event title"
        className="text-sm"
        containerClassName="min-h-11"
        value={session.task.title}
        onChange={(event) => session.setTask({ ...session.task, title: event.target.value })}
      />
      <TextInput
        label="Date"
        type="date"
        className="text-sm"
        containerClassName="min-h-11"
        value={session.task.date}
        onChange={(event) => session.setTask({ ...session.task, date: event.target.value })}
      />
      <div className="space-y-1.5">
        <label htmlFor="event-notes" className="text-xs font-medium text-muted-foreground">
          Event notes
        </label>
        <Textarea
          id="event-notes"
          className="min-h-24 text-sm"
          value={session.task.notes}
          onChange={(event) => session.setTask({ ...session.task, notes: event.target.value })}
        />
      </div>
    </section>
  );
}

function PickerBody({ session }: { session: PickerSession }) {
  return (
    <div className="space-y-4">
      {session.creating ? <PickerCreate session={session} /> : <PickerSearch session={session} />}
      <div className="flex justify-end border-t border-border pt-4">
        <Button
          variant="secondary"
          className="min-h-11 text-sm"
          onClick={() => session.setOpen(false)}
        >
          Done
        </Button>
      </div>
    </div>
  );
}

function InlinePicker({ session }: { session: PickerSession }) {
  return (
    <section aria-label="Choose contacts" className="space-y-4 border-t border-border pt-4">
      <h3 className="text-base font-semibold leading-tight tracking-normal">Choose contacts</h3>
      <PickerBody session={session} />
    </section>
  );
}

function DialogPicker({ session }: { session: PickerSession }) {
  return (
    <Dialog open={session.open} onOpenChange={session.setOpen}>
      <DialogContent className="max-h-screen overflow-y-auto bg-card">
        <DialogTitle className="text-base font-semibold leading-tight tracking-normal">
          Choose contacts
        </DialogTitle>
        <DialogDescription className="sr-only">
          Select contacts to link to this event.
        </DialogDescription>
        <PickerBody session={session} />
      </DialogContent>
    </Dialog>
  );
}
