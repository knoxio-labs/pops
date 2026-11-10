import { useEffect, useSyncExternalStore } from 'react';

import { Textarea, TextInput } from '@pops/ui';

import type { JSX } from 'react';

import type { PeopleEditor } from './editor';

/** Direct source field; background reads preserve dirty text, Escape discards only the local draft. */
export function MeetingField({
  value,
  label,
  multiline,
  date,
  save,
  editor,
  fieldKey,
}: {
  value: string;
  label: string;
  multiline?: boolean;
  date?: boolean;
  save: (value: string) => void;
  editor: PeopleEditor;
  fieldKey: string;
}): JSX.Element {
  const state = useSyncExternalStore(editor.subscribe, editor.snapshot);
  const draft = state.drafts.get(fieldKey) ?? null;
  useEffect(() => {
    if (draft === value) editor.setDraft(fieldKey, null);
  }, [draft, value, editor, fieldKey]);
  const common = {
    value: draft ?? value,
    className: 'min-h-11',
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      editor.setDraft(
        fieldKey,
        event.currentTarget.value === value ? null : event.currentTarget.value
      ),
    onBlur: () => {
      if (draft !== null && draft !== value) save(draft);
    },
    onKeyDown: (event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        editor.setDraft(fieldKey, null);
      }
    },
  };
  return multiline ? (
    <label className="block space-y-2 text-sm">
      {label}
      <Textarea {...common} />
    </label>
  ) : (
    <TextInput {...common} label={label} type={date ? 'date' : 'text'} />
  );
}
