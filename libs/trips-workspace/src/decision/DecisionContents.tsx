import { DecisionField } from './DecisionField';
import { DecisionHeader } from './DecisionHeader';
import { DecisionLinks } from './DecisionLinks';
import { DecisionOptions } from './DecisionOptions';
import { planLabel } from './use-decision-context';

import type { JSX } from 'react';

import type { DecisionEditor, DecisionEditorState } from './editor-types';
import type { DecisionSource } from './types';
import type { DecisionPlan } from './use-decision-context';

/** Independent decision facts stay mounted while source reads refresh or optional context fails. */
export function DecisionContents({
  editor,
  state,
  plans,
}: {
  editor: DecisionEditor;
  state: DecisionEditorState;
  plans: DecisionPlan[];
}): JSX.Element {
  const save = (sourceLinks: DecisionSource['decision']['sourceLinks']): Promise<boolean> =>
    editor.commit({ kind: 'edit-decision', fields: { sourceLinks } }, 'Edit decision sources');
  return (
    <fieldset disabled={state.busy || state.conflict} className="min-w-0 space-y-5">
      <legend className="sr-only">Decision source facts</legend>
      <DecisionHeader editor={editor} state={state} />
      <DecisionOptions editor={editor} state={state} plans={plans} />
      <details>
        <summary className="min-h-11 cursor-pointer content-center text-sm font-medium">
          Affected plans
        </summary>
        {state.source.options.flatMap((option) =>
          option.affectedSources.map((source) => (
            <p key={`${option.id}/${source.kind}/${source.id}`} className="py-2 text-sm">
              {option.title} · {planLabel(source, plans)}
            </p>
          ))
        )}
      </details>
      <details>
        <summary className="min-h-11 cursor-pointer content-center text-sm font-medium">
          Notes
        </summary>
        <DecisionField
          value={state.source.decision.notes}
          label="Decision notes"
          fieldKey="notes"
          editor={editor}
          save={(notes) =>
            editor.commit({ kind: 'edit-decision', fields: { notes } }, 'Edit decision notes')
          }
          multiline
        />
      </details>
      <DecisionLinks
        links={state.source.decision.sourceLinks}
        editor={editor}
        fieldKey="decision-links"
        save={save}
      />
    </fieldset>
  );
}
