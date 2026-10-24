import { choosePath, moveVisit } from './model';
import { PathOptions } from './path-options';
import { RouteRow } from './route-row';

import type { ReactNode } from 'react';

import type { PlannerState } from './model';

/** Render ordered visits, grouped alternatives and their nested excursions. */
export function PlannerVisits({
  state,
  layout,
  selected,
  editor,
  onChange,
  onSelect,
  onAdd,
}: {
  state: PlannerState;
  layout: 'inline' | 'side-editor';
  selected: string | null;
  editor: ReactNode;
  onChange: (state: PlannerState) => void;
  onSelect: (id: string) => void;
  onAdd: (id: string) => void;
}) {
  return (
    <div className="space-y-3">
      {!state.order.length && <p className="rounded-xl border border-dashed p-6">No visits.</p>}
      {state.order.map((id, index) => {
        const visit = state.records.find((r) => r.id === id);
        if (!visit) return null;
        if (visit.kind === 'gap')
          return (
            <div key={id} className="space-y-3">
              <PathOptions
                gap={visit}
                state={state}
                onChoose={(option) => onChange(choosePath(state, id, option))}
                onEdit={(r) => onSelect(r.id)}
              />
              {layout === 'inline' && visit.optionIds?.includes(selected ?? '') && editor}
            </div>
          );
        return (
          <div key={id} className="space-y-3">
            <RouteRow
              record={visit}
              state={state}
              index={index}
              onEdit={() => onSelect(id)}
              onMove={(delta) => onChange(moveVisit(state, id, delta))}
              onAdd={() => onAdd(id)}
            />
            {layout === 'inline' && selected === id && editor}
            <NestedVisits parentId={id} state={state} onEdit={onSelect} />
            {layout === 'inline' && selected && state.parents[selected] === id && editor}
          </div>
        );
      })}
    </div>
  );
}

function NestedVisits({
  parentId,
  state,
  onEdit,
}: {
  parentId: string;
  state: PlannerState;
  onEdit: (id: string) => void;
}) {
  return state.records
    .filter((r) => state.parents[r.id] === parentId)
    .map((record) => (
      <RouteRow
        key={record.id}
        record={record}
        state={state}
        index={0}
        onEdit={() => onEdit(record.id)}
        onMove={() => {}}
        onAdd={() => {}}
      />
    ));
}
