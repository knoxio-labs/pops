import { Link2, Unlink } from 'lucide-react';
import { useState } from 'react';

import { Button, EntitySelect } from '@pops/ui';

import { useInbox } from './context';
import {
  inboxTargetKinds,
  inboxTargetLabel,
  linkInboxSource,
  unlinkInboxAssociation,
} from './model';

import type { InboxRow } from './model';

/** Show exact linked targets and remove only the selected association. */
export function InboxAssociations({ row }: { row: InboxRow }) {
  const { state, change } = useInbox();
  if (!row.associations.length) return null;
  return (
    <section aria-label="Linked trip items" className="space-y-2">
      <h3 className="text-base font-semibold">Linked trip items</h3>
      <ul className="divide-y divide-border">
        {row.associations.map(({ association, target, label }) => (
          <li key={association.id} className="flex items-start justify-between gap-2 py-2">
            <div className="min-w-0 space-y-1">
              <p className="text-sm font-medium">{label}</p>
              {target && (
                <>
                  <p className="text-xs">
                    {inboxTargetKinds.find((kind) => kind.id === target.kind)?.label} ·{' '}
                    {target.intention} · {target.arrangement}
                  </p>
                  {target.notes && <p className="whitespace-pre-wrap text-sm">{target.notes}</p>}
                </>
              )}
            </div>
            <Button
              variant="ghost"
              aria-label={`Unlink ${label}`}
              onClick={() => change(unlinkInboxAssociation(state, association.id))}
            >
              <Unlink className="size-4" />
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Choose an explicit existing target; linking leaves both source and target records intact. */
export function LinkInboxTarget({ row }: { row: InboxRow }) {
  const { state, change } = useInbox();
  const [targetId, setTargetId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const targets = state.targets.filter(
    (target) =>
      target.kind !== 'gap' &&
      !row.associations.some((item) => item.association.targetId === target.id)
  );
  function link() {
    const result = linkInboxSource(state, row.id, targetId, crypto.randomUUID());
    setError(result.error);
    if (!result.error) {
      change(result.state);
      setTargetId('');
    }
  }
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1">
          <EntitySelect
            aria-label="Existing trip item"
            entities={targets.map((target) => ({
              id: target.id,
              name: inboxTargetLabel(state, target),
            }))}
            value={targetId}
            onChange={setTargetId}
            placeholder="Choose a trip item"
            searchPlaceholder="Search trip items"
          />
        </div>
        <Button variant="outline" disabled={!targetId} onClick={link}>
          <Link2 className="size-4" />
          Link
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
