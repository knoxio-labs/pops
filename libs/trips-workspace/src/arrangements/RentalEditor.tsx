import { Button, ErrorState, Select, TextInput } from '@pops/ui';

import { requestProblem } from '../stay/api';
import { RentalVisit } from './RentalVisit';
import { useRentalEditor } from './use-rental-editor';

import type { JSX } from 'react';

import type { RentalContext, RentalSourceContext } from './rental-context';
import type { Rental } from './types';
import type { RentalEditorState } from './use-rental-editor';

/** Canonical rental facts save independently, retain failed drafts and retry the original revision without rebasing. */
export function RentalEditor({
  identity,
  source,
  sources,
  saved,
  reload,
}: {
  identity: RentalContext;
  source: Rental;
  sources: RentalSourceContext;
  saved: (rental: Rental) => void;
  reload: () => Promise<Rental | undefined>;
}): JSX.Element {
  const labels = identity.labels;
  const editor = useRentalEditor(identity, source, saved);
  const { failure, busy, changed } = editor;
  return (
    <section className="space-y-4">
      {changed && <p role="status">{labels.sourceChanged}</p>}
      {failure && (
        <ErrorState error={requestProblem(failure.error)} onRetry={() => void editor.retry()} />
      )}
      <RentalFields identity={identity} sources={sources} editor={editor} />
      {(changed || failure) && (
        <Button
          variant="ghost"
          disabled={busy}
          className="min-h-11"
          onClick={async () => {
            const current = await reload();
            if (current) editor.discard(current);
          }}
        >
          {labels.reload}
        </Button>
      )}
    </section>
  );
}

function RentalFields({
  identity,
  sources,
  editor,
}: {
  identity: RentalContext;
  sources: RentalSourceContext;
  editor: RentalEditorState;
}): JSX.Element {
  const { labels } = identity;
  const { draft, setDraft, failure, busy, changed } = editor;
  const statuses: Rental['status'][] = [null, 'Considering', 'Reserved', 'Purchased'];
  return (
    <fieldset disabled={busy || failure !== undefined || changed} className="space-y-4">
      <legend className="sr-only">{labels.rental}</legend>
      <TextInput
        label={labels.provider}
        className="min-h-11"
        value={draft.provider ?? ''}
        onChange={(event) => setDraft({ ...draft, provider: event.target.value || null })}
      />
      <RentalEndpoints identity={identity} sources={sources} editor={editor} />
      <Select
        label={labels.status}
        className="min-h-11"
        value={draft.status ?? ''}
        options={statuses.map((status) => ({
          value: status ?? '',
          label: status ? labels.sourceStates[status] : labels.unset,
        }))}
        onChange={(event) => {
          const status = statuses.find((value) => (value ?? '') === event.target.value);
          if (status !== undefined) setDraft({ ...draft, status });
        }}
      />
      <RentalActions identity={identity} editor={editor} />
    </fieldset>
  );
}

function RentalEndpoints({
  identity,
  sources,
  editor,
}: {
  identity: RentalContext;
  sources: RentalSourceContext;
  editor: RentalEditorState;
}): JSX.Element {
  const { labels } = identity;
  const { draft, setDraft } = editor;
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <TextInput
        type="date"
        label={labels.start}
        className="min-h-11"
        value={draft.start ?? ''}
        onChange={(event) => setDraft({ ...draft, start: event.target.value || null })}
      />
      <TextInput
        type="date"
        label={labels.end}
        className="min-h-11"
        value={draft.end ?? ''}
        onChange={(event) => setDraft({ ...draft, end: event.target.value || null })}
      />
      <RentalVisit
        label={labels.pickup}
        value={draft.pickupVisitId ?? null}
        sources={sources}
        identity={identity}
        onChange={(pickupVisitId) => setDraft({ ...draft, pickupVisitId })}
      />
      <RentalVisit
        label={labels.return}
        value={draft.returnVisitId ?? null}
        sources={sources}
        identity={identity}
        onChange={(returnVisitId) => setDraft({ ...draft, returnVisitId })}
      />
    </div>
  );
}
function RentalActions({
  identity,
  editor,
}: {
  identity: RentalContext;
  editor: RentalEditorState;
}): JSX.Element {
  const { labels } = identity;
  const { confirmed, draft, inverse, dirty, run } = editor;
  return (
    <div className="flex flex-wrap gap-2">
      <Button
        className="min-h-11"
        disabled={!dirty}
        onClick={() => void run({ ...draft, expectedRevision: confirmed.revision })}
      >
        {labels.save}
      </Button>
      <Button
        variant="ghost"
        className="min-h-11"
        disabled={!inverse || dirty}
        onClick={() => void editor.undo()}
      >
        {labels.undo}
      </Button>
    </div>
  );
}
