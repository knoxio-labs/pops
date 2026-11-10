import { useSyncExternalStore } from 'react';

import { Button, TextInput } from '@pops/ui';

import { referenceEntries } from '../reference-entries';

import type { JSX } from 'react';

import type { DecisionEditor } from './editor-types';
import type { SourceLink } from './types';

/** Retain opaque provenance without claiming resolution; additions and removals replace only this explicit array. */
export function DecisionLinks({
  links,
  editor,
  fieldKey,
  save,
}: {
  links: SourceLink[];
  editor: DecisionEditor;
  fieldKey: string;
  save: (links: SourceLink[]) => Promise<boolean>;
}): JSX.Element {
  return (
    <details>
      <summary className="min-h-11 cursor-pointer content-center text-sm font-medium">
        Sources
      </summary>
      <div className="space-y-2">
        {referenceEntries(links).map(({ link, index, key }) => (
          <div key={key} className="flex flex-wrap items-center justify-between gap-2">
            <span className="break-all text-sm" title={link.uri}>
              {link.label ?? link.uri}
            </span>
            <Button
              variant="ghost"
              aria-label={`Remove source link ${index + 1}`}
              onClick={() => void save(links.filter((_, position) => position !== index))}
            >
              Remove
            </Button>
          </div>
        ))}
      </div>
      <AddLink editor={editor} fieldKey={fieldKey} save={async (link) => save([...links, link])} />
    </details>
  );
}
function AddLink({
  editor,
  fieldKey,
  save,
}: {
  editor: DecisionEditor;
  fieldKey: string;
  save: (link: SourceLink) => Promise<boolean>;
}): JSX.Element {
  const state = useSyncExternalStore(editor.subscribe, editor.getState, editor.getState);
  const uriKey = `${fieldKey}-uri`;
  const labelKey = `${fieldKey}-label`;
  const uri = state.drafts[uriKey] ?? '';
  const label = state.drafts[labelKey] ?? '';
  const cancel = (): void => {
    editor.setDraft(uriKey, undefined);
    editor.setDraft(labelKey, undefined);
  };
  return (
    <form
      className="space-y-2"
      onSubmit={async (event) => {
        event.preventDefault();
        if (await save({ uri, ...(label ? { label } : {}) })) {
          cancel();
        }
      }}
    >
      <TextInput
        label="Source URI"
        value={uri}
        required
        onChange={(event) => {
          editor.setDraft(uriKey, event.currentTarget.value || undefined);
        }}
      />
      <TextInput
        label="Source label"
        value={label}
        onChange={(event) => {
          editor.setDraft(labelKey, event.currentTarget.value || undefined);
        }}
      />
      <Button type="submit">Add source</Button>
      <Button type="button" variant="ghost" onClick={cancel}>
        Cancel
      </Button>
    </form>
  );
}
