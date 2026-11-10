import { useEffect, useSyncExternalStore } from 'react';

import { Textarea, TextInput } from '@pops/ui';

import type { JSX } from 'react';

import type { DecisionEditor } from './editor-types';

/** A source field retains an unsaved draft across reads and failures; Escape explicitly discards it. */
export function DecisionField({
  value,
  label,
  fieldKey,
  editor,
  save,
  multiline = false,
  type = 'text',
}: {
  value: string;
  label: string;
  fieldKey: string;
  editor: DecisionEditor;
  save: (value: string) => Promise<boolean>;
  multiline?: boolean;
  type?: 'text' | 'date';
}): JSX.Element {
  const state = useSyncExternalStore(editor.subscribe, editor.getState, editor.getState);
  const draft = state.drafts[fieldKey];
  useEffect(() => {
    if (draft !== undefined && draft === value) editor.setDraft(fieldKey, undefined);
  }, [draft, editor, fieldKey, value]);
  const change = (next: string): void => {
    editor.setDraft(fieldKey, next === value ? undefined : next);
  };
  const cancel = (): void => editor.setDraft(fieldKey, undefined);
  const common = {
    value: draft ?? value,
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      change(event.currentTarget.value),
    onBlur: async () => {
      if (
        draft !== undefined &&
        (await save(draft)) &&
        editor.getState().drafts[fieldKey] === draft
      )
        cancel();
    },
    onKeyDown: (event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        cancel();
      }
    },
    className: 'min-h-11',
  };
  return multiline ? (
    <label className="block space-y-2 text-sm">
      {label}
      <Textarea {...common} />
    </label>
  ) : (
    <TextInput {...common} label={label} type={type} />
  );
}
