import { useState } from 'react';

import { EntitySelect } from '@pops/ui';

import { useArrangements } from './context';
import { clearArrangementResponsibility, setArrangementResponsibility } from './model';

import type { ArrangementRow } from './model';

/** Selects or clears an explicit handler from known contacts; an absent assignment never means the viewer. */
export function ArrangementResponsibility({ row }: { row: ArrangementRow }) {
  const { state, change } = useArrangements();
  const [error, setError] = useState<string | null>(null);
  const contacts = state.contacts.map((contact) => ({
    id: contact.id,
    name: `${contact.name}${contact.self ? ' (me)' : ''}`,
  }));
  if (row.responsible && !row.responsible.available)
    contacts.push({ id: row.responsible.contactId, name: row.responsible.label });
  return (
    <section aria-label="Responsibility" className="space-y-1">
      <p className="text-xs text-muted-foreground">Handled by</p>
      <EntitySelect
        aria-label="Handled by"
        entities={contacts}
        value={row.responsible?.contactId}
        placeholder="Choose contact"
        clearLabel="Clear handler"
        onClear={() => {
          change(clearArrangementResponsibility(state, row.id));
          setError(null);
        }}
        onChange={(contactId) => {
          if (contactId === row.responsible?.contactId) return;
          const result = setArrangementResponsibility(state, row.id, contactId);
          if (result.error) setError(result.error);
          else {
            change(result.state);
            setError(null);
          }
        }}
      />
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </section>
  );
}
