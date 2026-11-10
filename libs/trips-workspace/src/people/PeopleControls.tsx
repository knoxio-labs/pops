import { Plus, RotateCcw } from 'lucide-react';

import { Button, PageHeader, Select, TextInput } from '@pops/ui';

import type { JSX, Dispatch, SetStateAction } from 'react';

import type { PeopleEditor, PeopleEditorSnapshot } from './editor';
import type { PeopleWorkspaceProps } from './types';
import type { usePeopleContext } from './use-people-context';

/** Explicit filters never alter source association or grouping. */
export interface PeopleFilters {
  query: string;
  intention: string;
  agreement: string;
  visitId: string;
}
/** Shared loaded context and source operations for workspace sections. */
export interface PeopleSectionProps {
  editor: PeopleEditor;
  state: PeopleEditorSnapshot;
  context: ReturnType<typeof usePeopleContext>;
  workspace: PeopleWorkspaceProps;
}

/** Parent navigation and source actions use the host's translated labels. */
export function PeopleControls({
  context,
  workspace,
  editor,
  state,
  filters,
  setFilters,
  add,
}: PeopleSectionProps & {
  filters: PeopleFilters;
  setFilters: Dispatch<SetStateAction<PeopleFilters>>;
  add: () => void;
}): JSX.Element {
  const text = workspace.text;
  return (
    <>
      <PageHeader
        title={text('title')}
        backHref="/trips"
        breadcrumbs={[
          { label: text('trips'), href: '/trips' },
          { label: context.trip.data?.name || context.trip.data?.destination || text('trip') },
          { label: text('title') },
        ]}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="ghost"
              className="min-h-11"
              disabled={!state.canUndo}
              onClick={() => void editor.undo()}
            >
              <RotateCcw aria-hidden className="size-4" />
              {text('undo')}
            </Button>
            <Button
              className="min-h-11"
              disabled={state.busy || state.failure !== null || !workspace.contacts}
              onClick={add}
            >
              <Plus aria-hidden className="size-4" />
              {text('add')}
            </Button>
          </div>
        }
      />
      <PeopleFilterFields {...{ filters, setFilters, context, workspace }} />
    </>
  );
}

function PeopleFilterFields({
  filters,
  setFilters,
  context,
  workspace,
}: Pick<PeopleSectionProps, 'context' | 'workspace'> & {
  filters: PeopleFilters;
  setFilters: Dispatch<SetStateAction<PeopleFilters>>;
}): JSX.Element {
  const text = workspace.text;
  return (
    <div className="grid gap-3 sm:max-lg:grid-cols-2 lg:grid-cols-4">
      <TextInput
        label={text('search')}
        value={filters.query}
        onChange={(event) => setFilters({ ...filters, query: event.currentTarget.value })}
        className="min-h-11"
      />
      <Select
        label={text('intention')}
        value={filters.intention}
        options={[
          { value: '', label: text('all') },
          ...(['Considering', 'Planned'] as const).map((value) => ({ value, label: text(value) })),
        ]}
        className="min-h-11"
        onChange={(event) => setFilters({ ...filters, intention: event.target.value })}
      />
      <Select
        label={text('agreement')}
        value={filters.agreement}
        options={[
          { value: '', label: text('all') },
          ...(['Not agreed', 'Agreed'] as const).map((value) => ({ value, label: text(value) })),
        ]}
        className="min-h-11"
        onChange={(event) => setFilters({ ...filters, agreement: event.target.value })}
      />
      <Select
        label={text('visit')}
        value={filters.visitId}
        options={[
          { value: '', label: text('all') },
          ...(context.visits.data ?? []).map((visit, index) => ({
            value: String(visit.id),
            label: `${index + 1}. ${context.places.data?.find((place) => place.id === visit.placeId)?.name ?? text('placeUnavailable')} · #${visit.id}`,
          })),
        ]}
        className="min-h-11"
        onChange={(event) => setFilters({ ...filters, visitId: event.target.value })}
      />
    </div>
  );
}
