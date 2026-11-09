import { useState } from 'react';

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@pops/ui';

import { useTripPeople } from './context';
import { TripPersonAvatar } from './identity';
import { MeetingFields } from './meeting-fields';
import { planFindings, removeTripPersonPlan, saveTripPersonPlan } from './model';
import { TripPersonSource } from './person-source';

import type { ReactNode } from 'react';

import type { PeopleRow } from './model';

/** Opens the selected person's own source and meeting record without a singleton contact route. */
export function TripPeopleSource({ row, children }: { row: PeopleRow; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const label = [row.personName, row.plan.title].filter(Boolean).join(' · ');
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          aria-label={`Open ${label}`}
          className="block h-auto min-h-11 w-full cursor-pointer whitespace-normal rounded-none p-3 text-left font-normal focus-visible:ring-inset"
        >
          {children}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <div className="flex items-center gap-3">
            <TripPersonAvatar name={row.personName} available={Boolean(row.contact)} large />
            <div>
              <DialogTitle>{row.personName}</DialogTitle>
              <DialogDescription>{row.plan.title}</DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <MeetingEditor key={row.id} row={row} close={() => setOpen(false)} />
        {row.contact && <TripPersonSource contact={row.contact} />}
      </DialogContent>
    </Dialog>
  );
}

function MeetingEditor({ row, close }: { row: PeopleRow; close: () => void }) {
  const { state, change } = useTripPeople();
  const [plan, setPlan] = useState(row.plan);
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        const result = saveTripPersonPlan(state, plan);
        if (result.error) setError(result.error);
        else {
          change(result.state);
          close();
        }
      }}
    >
      <MeetingFields plan={plan} change={setPlan} />
      {planFindings(state, plan).map((finding) => (
        <p key={finding.id} className="text-sm text-destructive">
          {finding.message}
        </p>
      ))}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit">Save meeting</Button>
        <Button type="button" variant="outline" onClick={close}>
          Cancel
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            change(removeTripPersonPlan(state, row.id));
            close();
          }}
        >
          Remove plan
        </Button>
      </div>
    </form>
  );
}
