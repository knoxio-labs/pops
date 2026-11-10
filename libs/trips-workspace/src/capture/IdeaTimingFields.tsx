import { Select, TextInput } from '@pops/ui';

import type { JSX } from 'react';

import type { IdeaFieldProps } from './idea-field-types';

/** Preserve declared timing precision and optional bounds without supplying dates from a visit. */
export function IdeaTimingFields(props: IdeaFieldProps): JSX.Element {
  const { session, row, value, busy } = props;
  return (
    <div className="space-y-3">
      <Select
        label="Idea timing"
        value={value.timing.mode}
        disabled={busy}
        options={[
          { value: 'none', label: 'No timing' },
          { value: 'month', label: 'Month' },
          { value: 'dates', label: 'Dates' },
        ]}
        onChange={(event) => {
          if (event.target.value === 'month')
            session.records.editIdea(row, { timing: { mode: 'month' } });
          else if (event.target.value === 'dates')
            session.records.editIdea(row, { timing: { mode: 'dates' } });
          else session.records.editIdea(row, { timing: { mode: 'none' } });
          void session.records.saveIdea(row.id);
        }}
      />
      {value.timing.mode === 'month' ? (
        <TextInput
          label="Idea month"
          placeholder="YYYY-MM"
          value={value.timing.month ?? ''}
          disabled={busy}
          onChange={(event) =>
            session.records.editIdea(row, {
              timing: {
                mode: 'month',
                ...(event.target.value ? { month: event.target.value } : {}),
              },
            })
          }
          onBlur={() => void session.records.saveIdea(row.id)}
        />
      ) : null}
      {value.timing.mode === 'dates' ? <IdeaDateBounds {...props} /> : null}
    </div>
  );
}
function IdeaDateBounds({ session, row, value, busy }: IdeaFieldProps): JSX.Element | null {
  const timing = value.timing;
  if (timing.mode !== 'dates') return null;
  const change = (field: 'from' | 'to', date: string): void => {
    const next = { ...timing };
    if (date) next[field] = date;
    else delete next[field];
    session.records.editIdea(row, { timing: next });
  };
  return (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-2">
        <TextInput
          type="date"
          label="Idea from"
          value={timing.from ?? ''}
          disabled={busy}
          onChange={(event) => change('from', event.target.value)}
          onBlur={() => void session.records.saveIdea(row.id)}
        />
        <TextInput
          type="date"
          label="Idea to"
          value={timing.to ?? ''}
          disabled={busy}
          onChange={(event) => change('to', event.target.value)}
          onBlur={() => void session.records.saveIdea(row.id)}
        />
      </div>
    </div>
  );
}
