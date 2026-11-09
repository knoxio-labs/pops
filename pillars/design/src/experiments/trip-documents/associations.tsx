import { Link2, Unlink } from 'lucide-react';
import { useState } from 'react';

import { Button, ComboboxSelect } from '@pops/ui';

import { useTripDocuments } from './context';
import { attachTripDocumentSelection, unlinkTripDocument } from './model';

import type { DocumentRow } from './model';

function AssociationList({ row }: { row: DocumentRow }) {
  const { state, change } = useTripDocuments();
  return (
    <ul className="divide-y divide-border">
      {row.links.map((link) => {
        const label =
          state.linking.targets.find((target) => target.id === link.targetId)?.label ??
          'Linked item unavailable';
        const visits = state.targetVisits
          .filter((item) => item.targetId === link.targetId)
          .map(
            (item) =>
              state.visits.find((visit) => visit.id === item.visitId)?.name ?? 'Visit unavailable'
          );
        return (
          <li key={link.id} className="flex items-center justify-between gap-2 py-1 text-sm">
            <span>
              {label}
              {visits.length > 0 && (
                <span className="block text-xs text-muted-foreground">{visits.join(' → ')}</span>
              )}
            </span>
            <Button
              variant="ghost"
              aria-label={`Unlink ${label}`}
              onClick={() => change(unlinkTripDocument(state, link.id))}
            >
              <Unlink className="size-4" />
            </Button>
          </li>
        );
      })}
    </ul>
  );
}

/** Edit individual associations while preserving the selected original and its other links. */
export function DocumentAssociations({ row }: { row: DocumentRow }) {
  const { state, change } = useTripDocuments();
  const [targetId, setTargetId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const targets = state.linking.targets.filter(
    (target) => !row.links.some((link) => link.targetId === target.id)
  );
  function attach() {
    const result = attachTripDocumentSelection(
      { ...state, linking: { ...state.linking, targetId, selectedIds: [row.id] } },
      () => crypto.randomUUID()
    );
    setError(result.error);
    if (!result.error) {
      change({ ...state, linking: { ...state.linking, links: result.state.linking.links } });
      setTargetId('');
    }
  }
  return (
    <section aria-label="Linked plans" className="space-y-3">
      <h3 className="text-base font-semibold">Linked plans</h3>
      <AssociationList row={row} />
      {row.document?.availability === 'available' && targets.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="min-w-0 flex-1">
            <ComboboxSelect
              aria-label="Link document to"
              value={targetId}
              placeholder="Choose a trip or item"
              options={targets.map((target) => ({ value: target.id, label: target.label }))}
              onChange={(id) => {
                if (typeof id === 'string') setTargetId(id);
              }}
            />
          </div>
          <Button variant="outline" disabled={!targetId} onClick={attach}>
            <Link2 className="size-4" />
            Link
          </Button>
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </section>
  );
}
