import { Plus } from 'lucide-react';
import { useState } from 'react';

import { Button, ComboboxSelect, EntitySelect, Textarea, TextInput } from '@pops/ui';

import { useInbox } from './context';
import {
  createInboxTarget,
  emptyInboxTargetDraft,
  inboxTargetKinds,
  inboxTargetLabel,
} from './model';
import { InboxTargetSettings, InboxTargetState } from './settings';

import type { InboxNewTargetDraft, InboxRow } from './model';

function TargetDetails({
  draft,
  change,
}: {
  draft: InboxNewTargetDraft;
  change: (next: InboxNewTargetDraft) => void;
}) {
  const { state } = useInbox();
  return (
    <details>
      <summary className="min-h-11 cursor-pointer py-3 text-sm">
        Location, visit and settings
      </summary>
      <div className="space-y-3 pb-2">
        <InboxTargetSettings draft={draft} change={change} />
        <EntitySelect
          aria-label="New item location"
          entities={state.places.map((place) => ({ id: place.id, name: place.name }))}
          value={draft.placeId}
          onChange={(placeId) => change({ ...draft, placeId })}
          onClear={() => change({ ...draft, placeId: '' })}
          placeholder="Location"
        />
        <EntitySelect
          aria-label="New item visit"
          entities={state.targets
            .filter((target) => target.kind === 'city')
            .map((target) => ({ id: target.id, name: inboxTargetLabel(state, target) }))}
          value={draft.visitId}
          onChange={(visitId) => change({ ...draft, visitId })}
          onClear={() => change({ ...draft, visitId: '' })}
          placeholder="Visit"
        />
        <Textarea
          aria-label="New item notes"
          placeholder="Notes"
          value={draft.notes}
          onChange={(event) => change({ ...draft, notes: event.currentTarget.value })}
        />
      </div>
    </details>
  );
}

/** Create a typed local item only from explicit fields and link it without replacing the raw source. */
export function CreateInboxTarget({ row }: { row: InboxRow }) {
  const { state, change } = useInbox();
  const [draft, setDraft] = useState(() => emptyInboxTargetDraft(state));
  const [error, setError] = useState<string | null>(null);
  function create() {
    const result = createInboxTarget(state, row.id, draft, {
      targetId: crypto.randomUUID(),
      associationId: crypto.randomUUID(),
    });
    setError(result.error);
    if (!result.error) {
      change(result.state);
      setDraft(emptyInboxTargetDraft(state));
    }
  }
  return (
    <div className="space-y-3">
      <label className="block space-y-1 text-xs">
        <span>Item type</span>
        <ComboboxSelect
          aria-label="New item type"
          value={draft.kind}
          placeholder="Choose type"
          options={inboxTargetKinds.map((kind) => ({ value: kind.id, label: kind.label }))}
          onChange={(value) => {
            const kind = inboxTargetKinds.find((item) => item.id === value);
            if (kind) setDraft({ ...draft, kind: kind.id });
          }}
        />
      </label>
      <label className="block space-y-1 text-xs">
        <span>Title</span>
        <TextInput
          aria-label="New item title"
          value={draft.title}
          onChange={(event) => setDraft({ ...draft, title: event.currentTarget.value })}
        />
      </label>
      <TargetDetails draft={draft} change={setDraft} />
      <InboxTargetState draft={draft} />
      <Button variant="outline" disabled={!draft.kind || !draft.title.trim()} onClick={create}>
        <Plus className="size-4" />
        Create item
      </Button>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
