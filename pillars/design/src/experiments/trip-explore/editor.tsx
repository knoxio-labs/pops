import { useState } from 'react';

import {
  Button,
  ComboboxSelect,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
  Textarea,
  TextInput,
} from '@pops/ui';

import { useExplore } from './context';
import { ExploreCity } from './fields';
import {
  exploreDraft,
  exploreFacts,
  exploreStatuses,
  removeExploreRecord,
  updateExploreRecord,
} from './model';
import { ExploreSourceFacts } from './source';

import type { ReactNode } from 'react';

import type { ExploreDraft, ExploreRecord } from './model';

/** Opens the selected source record's own editable fields, retaining unrelated source data. */
export function ExploreEditor({
  record,
  children,
}: {
  record: ExploreRecord;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const facts = exploreFacts(record);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          className="block h-auto min-h-11 w-full cursor-pointer whitespace-normal rounded-xl p-3 text-left font-normal"
          aria-label={`Open ${facts.name}`}
        >
          {children}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{facts.name}</DialogTitle>
          <DialogDescription>
            {facts.kind ? 'Saved possibility' : 'Captured text'}
          </DialogDescription>
        </DialogHeader>
        <ExploreEditorForm key={record.id} record={record} close={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

function ExploreEditorForm({ record, close }: { record: ExploreRecord; close: () => void }) {
  const { state, change } = useExplore();
  const [draft, setDraft] = useState(() => exploreDraft(record));
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        const result = updateExploreRecord(state, record.id, draft);
        if (result.error) {
          setError(result.error);
          return;
        }
        change(result.state);
        close();
      }}
    >
      <TextInput
        label="Name"
        value={draft.name}
        onChange={(event) => setDraft({ ...draft, name: event.currentTarget.value })}
      />
      <ExploreEditorSelections
        draft={draft}
        change={setDraft}
        citiesOnly={record.source === 'idea'}
      />
      <div className="space-y-1">
        <label htmlFor="explore-notes" className="text-sm">
          Notes
        </label>
        <Textarea
          id="explore-notes"
          value={draft.notes}
          onChange={(event) => setDraft({ ...draft, notes: event.currentTarget.value })}
        />
      </div>
      <ExploreSourceFacts record={record} />
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <ExploreEditorActions
        close={close}
        remove={() => {
          change(removeExploreRecord(state, record.id));
          close();
        }}
      />
    </form>
  );
}

function ExploreEditorSelections({
  draft,
  change,
  citiesOnly,
}: {
  draft: ExploreDraft;
  change: (next: ExploreDraft) => void;
  citiesOnly: boolean;
}) {
  const statuses = exploreStatuses(draft.kind);
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div className="space-y-1">
        <span className="text-sm">Location</span>
        <ExploreCity
          value={draft.cityId}
          citiesOnly={citiesOnly}
          change={(cityId) => change({ ...draft, cityId })}
        />
      </div>
      {statuses.length > 0 && (
        <div className="space-y-1">
          <span className="text-sm">Status</span>
          <ComboboxSelect
            aria-label="Status"
            value={draft.status}
            options={statuses.map((status) => ({ value: status, label: status }))}
            onChange={(status) => {
              if (typeof status === 'string') change({ ...draft, status });
            }}
          />
        </div>
      )}
    </div>
  );
}

function ExploreEditorActions({ close, remove }: { close: () => void; remove: () => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      <Button type="submit">Save changes</Button>
      <Button type="button" variant="outline" onClick={close}>
        Cancel
      </Button>
      <Button type="button" variant="ghost" onClick={remove}>
        Remove
      </Button>
    </div>
  );
}
