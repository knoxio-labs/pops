import { Plus } from 'lucide-react';
import { useState } from 'react';

import { Button, TextInput } from '@pops/ui';

import { useDecision } from './context';
import { DecisionText } from './fields';
import { OptionHeader } from './option-header';
import { OptionLinks } from './option-links';
import { ArrangementRow } from './sources';

import type { DecisionState } from './model';

type Option = DecisionState['options'][number];

/** Editable options retain all competing choices after a selection. */
export function DecisionOptions() {
  const { state, change } = useDecision();
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState('');
  return (
    <section aria-label="Options" className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">
          Options{' '}
          <span className="text-sm font-normal text-muted-foreground">{state.options.length}</span>
        </h2>
        <Button variant="ghost" onClick={() => setAdding(!adding)} aria-expanded={adding}>
          <Plus className="size-4" aria-hidden />
          Add option
        </Button>
      </div>
      {adding && (
        <form
          className="flex flex-wrap gap-2 rounded-lg border bg-card p-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (!title.trim()) return;
            change({
              ...state,
              options: [
                ...state.options,
                { id: crypto.randomUUID(), title: title.trim(), notes: '', affectedIds: [] },
              ],
            });
            setTitle('');
            setAdding(false);
          }}
        >
          <TextInput
            label="Option name"
            value={title}
            onChange={(event) => setTitle(event.currentTarget.value)}
            required
          />
          <Button type="submit" disabled={!title.trim()}>
            Add
          </Button>
          <Button type="button" variant="ghost" onClick={() => setAdding(false)}>
            Cancel
          </Button>
        </form>
      )}
      {state.options.map((option, index) => (
        <OptionCard key={option.id} option={option} index={index} />
      ))}
    </section>
  );
}

function OptionCard({ option, index }: { option: Option; index: number }) {
  const { state, change } = useDecision();
  const selected = state.selectedOptionId === option.id;
  const update = (next: Option) =>
    change({
      ...state,
      options: state.options.map((item) => (item.id === option.id ? next : item)),
    });
  return (
    <article
      aria-label={`Option ${index + 1}`}
      className={`rounded-xl border border-dashed bg-muted/60 p-4 shadow-sm ${selected ? 'border-app-accent ring-1 ring-app-accent' : 'border-foreground/30'}`}
    >
      <OptionHeader option={option} index={index} update={update} />
      <DecisionText
        multiline
        value={option.notes}
        label={`Option ${index + 1} notes`}
        onCommit={(notes) => update({ ...option, notes })}
      />
      {option.affectedIds.length > 0 && (
        <div className="mt-2 divide-y border-t">
          {option.affectedIds.map((id) => {
            const source = state.arrangements.find((item) => item.id === id);
            return source ? (
              <ArrangementRow key={id} source={source} />
            ) : (
              <p key={id} className="py-2 text-sm text-destructive">
                Linked plan unavailable
              </p>
            );
          })}
        </div>
      )}
      <OptionLinks option={option} index={index} update={update} />
    </article>
  );
}
