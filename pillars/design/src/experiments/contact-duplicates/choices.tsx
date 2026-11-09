import { ComboboxSelect } from '@pops/ui';

import { contactKindLabel } from './facts';
import { duplicateSources } from './model';

import type { DuplicateState } from './model';

const choices = [
  { key: 'retainedId', title: 'Keep contact' },
  { key: 'nameSourceId', title: 'Name' },
  { key: 'kindSourceId', title: 'Type' },
] as const;

/** Selects identity, name and kind independently; changing the retained contact never resets other choices. */
export function DuplicateChoices({
  state,
  change,
}: {
  state: DuplicateState;
  change: (state: DuplicateState) => void;
}) {
  const sources = duplicateSources(state);
  return (
    <section
      aria-label="Field choices"
      className="space-y-4 rounded-xl border border-border bg-card p-4"
    >
      <h2 className="text-base font-semibold leading-tight tracking-normal">Field choices</h2>
      {choices.map(({ key, title }) => (
        <div key={key} className="space-y-1.5">
          <label htmlFor={`duplicate-${key}`} className="text-xs font-medium text-muted-foreground">
            {title}
          </label>
          <ComboboxSelect
            id={`duplicate-${key}`}
            aria-label={title}
            className="min-h-11 text-sm"
            value={state[key] ?? ''}
            placeholder="Choose a source contact"
            options={sources.map((contact, index) => {
              const value = key === 'kindSourceId' ? contactKindLabel(contact.kind) : contact.name;
              return { value: contact.id, label: `${value} · Contact ${index + 1}` };
            })}
            onChange={(id) => {
              if (typeof id === 'string') change({ ...state, [key]: id });
            }}
          />
        </div>
      ))}
    </section>
  );
}
