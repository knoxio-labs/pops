import { useId, useState } from 'react';

import { Button, Input } from '@pops/ui';

import { useWebSearch } from '../../inventory-web/useWebSearch.js';

import type { KeyboardEvent, ReactElement } from 'react';

import type { FormFieldDef, ReferenceChoice } from './field-model';
import type { DraftAction, ItemDraft } from './form-draft';

/** Props for a reference field's query and selected references. */
export interface ReferenceFieldProps {
  readonly field: FormFieldDef;
  readonly draft: ItemDraft;
  readonly dispatch: (action: DraftAction) => void;
  readonly onReferenceQuery: (query: string) => void;
}

interface ReferenceCandidate {
  readonly id: string;
  readonly kind: 'item' | 'location';
  readonly label: string;
}

function candidatesFor(
  field: FormFieldDef,
  results: ReturnType<typeof useWebSearch>['results']
): ReferenceCandidate[] {
  const candidates: ReferenceCandidate[] = [];
  if (field.referenceKinds.includes('item')) {
    for (const hit of results.items) {
      if (
        field.referenceTypeIds.length === 0 ||
        (hit.item.typeId !== null && field.referenceTypeIds.includes(hit.item.typeId))
      ) {
        candidates.push({ id: hit.item.id, kind: 'item', label: hit.item.name });
      }
    }
  }
  if (field.referenceKinds.includes('location')) {
    for (const hit of results.places) {
      candidates.push({ id: hit.place.id, kind: 'location', label: hit.place.name });
    }
  }
  return candidates;
}

function addReference(
  field: FormFieldDef,
  refs: readonly ReferenceChoice[],
  candidate: ReferenceCandidate,
  dispatch: ReferenceFieldProps['dispatch']
): void {
  if (refs.some((ref) => ref.id === candidate.id && ref.kind === candidate.kind)) return;
  const next = field.cardinality === 'many' ? [...refs, candidate] : [candidate];
  dispatch({ type: 'field-refs', fieldId: field.id, refs: next });
}

function ReferenceMatches({
  field,
  candidates,
  refs,
  dispatch,
  clearQuery,
}: {
  readonly field: FormFieldDef;
  readonly candidates: readonly ReferenceCandidate[];
  readonly refs: readonly ReferenceChoice[];
  readonly dispatch: ReferenceFieldProps['dispatch'];
  readonly clearQuery: () => void;
}): ReactElement | null {
  if (candidates.length === 0) return null;
  return (
    <div role="listbox" aria-label={`${field.label} matches`} className="space-y-1">
      {candidates.slice(0, 8).map((candidate) => (
        <Button
          key={`${candidate.kind}-${candidate.id}`}
          type="button"
          variant="ghost"
          size="sm"
          className="w-full justify-start"
          onClick={() => {
            addReference(field, refs, candidate, dispatch);
            clearQuery();
          }}
        >
          {candidate.label}
        </Button>
      ))}
    </div>
  );
}

function SelectedReferences({
  field,
  refs,
  dispatch,
}: {
  readonly field: FormFieldDef;
  readonly refs: readonly ReferenceChoice[];
  readonly dispatch: ReferenceFieldProps['dispatch'];
}): ReactElement | null {
  if (refs.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {refs.map((ref) => (
        <Button
          key={`${ref.kind}-${ref.id}`}
          type="button"
          variant="secondary"
          size="sm"
          onClick={() =>
            dispatch({
              type: 'field-refs',
              fieldId: field.id,
              refs: refs.filter(
                (candidate) => candidate.id !== ref.id || candidate.kind !== ref.kind
              ),
            })
          }
        >
          {ref.label} ×
        </Button>
      ))}
    </div>
  );
}

/** Renders reference search results and selected item/location chips. */
export function ReferenceField({
  field,
  draft,
  dispatch,
  onReferenceQuery,
}: ReferenceFieldProps): ReactElement {
  const queryId = useId();
  const [query, setQuery] = useState('');
  const refs = draft.fields.refs[field.id] ?? [];
  const search = useWebSearch({ q: query, limit: 20 });
  const candidates = candidatesFor(field, search.results).filter(
    (candidate) => !refs.some((ref) => ref.id === candidate.id && ref.kind === candidate.kind)
  );
  const setSearch = (value: string): void => {
    setQuery(value);
    onReferenceQuery(value);
  };
  const addFromQuery = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key !== 'Enter') return;
    const candidate = candidates[0];
    if (candidate === undefined) return;
    event.preventDefault();
    addReference(field, refs, candidate, dispatch);
    setSearch('');
  };
  return (
    <div className="space-y-2">
      <Input
        id={queryId}
        value={query}
        placeholder="Search items and places, then press Enter"
        onChange={(event) => setSearch(event.target.value)}
        onKeyDown={addFromQuery}
        aria-label={field.label}
      />
      <ReferenceMatches
        field={field}
        candidates={candidates}
        refs={refs}
        dispatch={dispatch}
        clearQuery={() => setSearch('')}
      />
      <SelectedReferences field={field} refs={refs} dispatch={dispatch} />
    </div>
  );
}
