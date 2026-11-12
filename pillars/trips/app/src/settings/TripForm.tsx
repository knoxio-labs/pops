import { useTranslation } from 'react-i18next';

import { Button, Textarea } from '@pops/ui';

import { draftIssues } from './model';
import { TripReferences } from './TripReferences';
import { TripTextFields } from './TripTextFields';

import type { ReactNode } from 'react';

import type { Tag, Trip } from '../api/types';
import type { TripDraft } from './model';

/** Supported source inputs and explicit persistence actions for the approved form. */
export interface TripFormProps {
  draft: TripDraft;
  previous?: TripDraft;
  change: (draft: TripDraft) => void;
  trips: Trip[] | undefined;
  tags: Tag[] | undefined;
  id?: number;
  busy: boolean;
  /** Unresolved creation freezes its submitted fields while Retry and Close remain available. */
  locked?: boolean;
  mode: 'create' | 'settings';
  submit: () => void;
  cancel?: () => void;
  pristine?: boolean;
  discard?: () => void;
  error?: ReactNode;
  tagsFailed: boolean;
  retryTags: () => void;
  parentsFailed: boolean;
  retryParents: () => void;
}

/** Full approved source form; creation never displays or derives route dates. */
export function TripForm(props: TripFormProps) {
  const { t } = useTranslation('trips');
  const { draft, change, busy, mode, submit, error } = props;
  const issues = draftIssues(draft, props.trips, props.tags, {
    id: props.id,
    previous: props.previous,
  });
  return (
    <form
      aria-label={t(mode === 'create' ? 'newTrip' : 'settings')}
      noValidate
      className="space-y-4 text-sm"
      onSubmit={(event) => {
        event.preventDefault();
        if (!busy && !props.locked && !issues.length) submit();
      }}
    >
      <fieldset disabled={busy || props.locked} className="space-y-4">
        <TripTextFields draft={draft} change={change} />
        <TripReferences {...props} />
        <NotesField draft={draft} change={change} mode={mode} />
      </fieldset>
      {error}
      <FormActions {...props} invalid={!!issues.length} />
    </form>
  );
}

function NotesField({
  draft,
  change,
  mode,
}: {
  draft: TripDraft;
  change: (draft: TripDraft) => void;
  mode: 'create' | 'settings';
}) {
  const { t } = useTranslation('trips');
  const field = (
    <Textarea
      aria-label={t('notes')}
      value={draft.notes}
      onChange={(event) => change({ ...draft, notes: event.currentTarget.value })}
    />
  );
  return mode === 'create' ? (
    <section className="space-y-2 border-t border-border pt-4">
      <h2 className="text-base font-semibold">{t('notes')}</h2>
      {field}
    </section>
  ) : (
    <details>
      <summary className="min-h-11 cursor-pointer py-3 text-sm font-medium">{t('notes')}</summary>
      {field}
    </details>
  );
}

function FormActions(props: TripFormProps & { invalid: boolean }) {
  const { busy, mode, cancel, pristine, discard } = props;
  const { t } = useTranslation('trips');
  let label = mode === 'create' ? 'createTrip' : 'save';
  if (busy) label = 'saving';
  return (
    <footer className="flex justify-end gap-2 border-t border-border pt-4">
      {mode === 'settings' && discard && (
        <Button
          type="button"
          variant="ghost"
          disabled={busy || pristine === true}
          className="min-h-11"
          onClick={discard}
        >
          {t('discard')}
        </Button>
      )}
      {cancel && (
        <Button
          type="button"
          variant="outline"
          disabled={busy && mode === 'settings'}
          className="min-h-11"
          onClick={cancel}
        >
          {t('cancel')}
        </Button>
      )}
      <Button
        type="submit"
        disabled={submissionBlocked(props)}
        className="min-h-11 bg-app-accent text-app-accent-foreground hover:bg-app-accent/90"
      >
        {t(label)}
      </Button>
    </footer>
  );
}

function submissionBlocked(props: TripFormProps & { invalid: boolean }): boolean {
  return (
    props.busy ||
    props.locked === true ||
    props.invalid ||
    (props.mode === 'settings' && props.pristine === true)
  );
}
