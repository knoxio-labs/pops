import { Plus, Trash2 } from 'lucide-react';
import { useState, useSyncExternalStore } from 'react';

import { Badge, Button, TextInput } from '@pops/ui';

import { DecisionField } from './DecisionField';
import { DecisionLinks } from './DecisionLinks';
import { DecisionPlans } from './DecisionPlans';

import type { JSX } from 'react';

import type { DecisionEditor, DecisionEditorState } from './editor-types';
import type { DecisionOption, OptionFields } from './types';
import type { DecisionPlan } from './use-decision-context';

type Props = { editor: DecisionEditor; state: DecisionEditorState; plans: DecisionPlan[] };
/** Options precede impact inspection; choosing one preserves every competing option and all source arrangements. */
export function DecisionOptions({ editor, state, plans }: Props): JSX.Element {
  return (
    <section aria-label="Options" className="space-y-3">
      <h2 className="text-lg font-semibold">
        Options <span className="text-sm text-muted-foreground">{state.source.options.length}</span>
      </h2>
      <AddOption editor={editor} />
      {state.source.options.length === 0 && (
        <p className="text-sm text-muted-foreground">No options recorded</p>
      )}
      {state.source.options.map((option, index) => (
        <OptionCard
          key={option.id}
          option={option}
          index={index}
          editor={editor}
          selected={state.source.decision.selectedOptionId === option.id}
          plans={plans}
        />
      ))}
    </section>
  );
}
function AddOption({ editor }: Pick<Props, 'editor'>): JSX.Element {
  const [adding, setAdding] = useState(false);
  const state = useSyncExternalStore(editor.subscribe, editor.getState, editor.getState);
  const title = state.drafts['new-option'] ?? '';
  const cancel = (): void => {
    setAdding(false);
    editor.setDraft('new-option', undefined);
  };
  if (!adding && title === '')
    return (
      <Button variant="ghost" onClick={() => setAdding(true)}>
        <Plus aria-hidden className="size-4" />
        Add option
      </Button>
    );
  return (
    <form
      className="flex flex-wrap items-end gap-2 rounded-lg border bg-card p-3"
      onSubmit={async (event) => {
        event.preventDefault();
        if (
          title.trim() &&
          (await editor.commit(
            { kind: 'add-option', fields: { title: title.trim() } },
            'Add option'
          ))
        )
          cancel();
      }}
    >
      <TextInput
        label="Option name"
        value={title}
        required
        onChange={(event) => {
          editor.setDraft('new-option', event.currentTarget.value || undefined);
        }}
      />
      <Button type="submit" disabled={!title.trim()}>
        Add
      </Button>
      <Button type="button" variant="ghost" onClick={cancel}>
        Cancel
      </Button>
    </form>
  );
}
function OptionCard({
  option,
  index,
  editor,
  selected,
  plans,
}: {
  option: DecisionOption;
  index: number;
  editor: DecisionEditor;
  selected: boolean;
  plans: DecisionPlan[];
}): JSX.Element {
  const title = `Option ${index + 1}`;
  const save = (fields: OptionFields): Promise<boolean> =>
    editor.commit({ kind: 'edit-option', id: option.id, fields }, `Edit ${title}`);
  return (
    <article
      aria-label={title}
      className={`space-y-3 rounded-xl border border-dashed bg-muted/60 p-4 shadow-sm ${selected ? 'border-app-accent ring-1 ring-app-accent' : 'border-foreground/30'}`}
    >
      <OptionActions editor={editor} option={option} title={title} selected={selected} />
      <DecisionField
        value={option.title}
        label={`${title} name`}
        fieldKey={`option-${option.id}-title`}
        editor={editor}
        save={(value) => save({ title: value })}
      />
      <DecisionField
        value={option.notes}
        label={`${title} notes`}
        fieldKey={`option-${option.id}-notes`}
        editor={editor}
        save={(value) => save({ notes: value })}
        multiline
      />
      <DecisionPlans
        sources={option.affectedSources}
        plans={plans}
        save={(affectedSources) => void save({ affectedSources })}
      />
      <DecisionLinks
        links={option.sourceLinks}
        editor={editor}
        fieldKey={`option-${option.id}-links`}
        save={(sourceLinks) => save({ sourceLinks })}
      />
    </article>
  );
}

function OptionActions({
  editor,
  option,
  title,
  selected,
}: {
  editor: DecisionEditor;
  option: DecisionOption;
  title: string;
  selected: boolean;
}): JSX.Element {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span className="text-sm text-muted-foreground">{title}</span>
      {selected ? (
        <Badge variant="outline">Selected</Badge>
      ) : (
        <Button
          variant="outline"
          onClick={() =>
            void editor.commit({ kind: 'select-option', optionId: option.id }, `Choose ${title}`)
          }
        >
          Choose {title}
        </Button>
      )}
      <Button
        variant="ghost"
        aria-label={`Delete ${title}`}
        onClick={() =>
          void editor.commit({ kind: 'remove-option', id: option.id }, `Delete ${title}`)
        }
      >
        <Trash2 className="size-4" aria-hidden />
        Delete
      </Button>
    </div>
  );
}
