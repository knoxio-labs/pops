import { CircleHelp } from 'lucide-react';

import { Badge, Button } from '@pops/ui';

import { DecisionField } from './DecisionField';

import type { JSX } from 'react';

import type { DecisionEditor, DecisionEditorState } from './editor-types';
import type { DecisionFields } from './types';

/** Fixed Decision identity, independent source question and date-only deadline, and explicit selection status. */
export function DecisionHeader({
  editor,
  state,
}: {
  editor: DecisionEditor;
  state: DecisionEditorState;
}): JSX.Element {
  const decision = state.source.decision;
  const save = (fields: DecisionFields): Promise<boolean> =>
    editor.commit({ kind: 'edit-decision', fields }, 'Edit decision');
  return (
    <section
      aria-label="Decision"
      className="space-y-3 rounded-xl border border-foreground/30 bg-muted/60 p-4 shadow-sm"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-sm text-muted-foreground">
          <CircleHelp className="size-5 text-app-accent" aria-hidden />
          Decision
        </span>
        <Badge variant="outline">{decision.selectedOptionId === null ? 'Open' : 'Decided'}</Badge>
      </div>
      <DecisionField
        value={decision.question}
        label="Question"
        fieldKey="question"
        editor={editor}
        save={(question) => save({ question })}
      />
      <DecisionField
        type="date"
        value={decision.deadline ?? ''}
        label="Decide by"
        fieldKey="deadline"
        editor={editor}
        save={(deadline) => save({ deadline: deadline || null })}
      />
      {decision.deadline !== null && (
        <Button variant="ghost" onClick={() => void save({ deadline: null })}>
          Remove deadline
        </Button>
      )}
      {decision.selectedOptionId !== null && (
        <Button
          variant="outline"
          onClick={() =>
            void editor.commit({ kind: 'select-option', optionId: null }, 'Reopen decision')
          }
        >
          Reopen
        </Button>
      )}
    </section>
  );
}
