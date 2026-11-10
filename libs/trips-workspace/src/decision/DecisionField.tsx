import { useEffect, useState } from 'react';

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
  const [draft, setDraft] = useState<string | null>(null);
  if (draft !== null && draft === value) setDraft(null);
  useEffect(() => {
    editor.setDirty(fieldKey, draft !== null && draft !== value);
  }, [draft, editor, fieldKey, value]);
  useEffect(() => () => editor.setDirty(fieldKey, false), [editor, fieldKey]);
  const change = (next: string): void => {
    setDraft(next === value ? null : next);
    editor.setDirty(fieldKey, next !== value);
  };
  const cancel = (): void => {
    setDraft(null);
    editor.setDirty(fieldKey, false);
  };
  const common = {
    value: draft ?? value,
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      change(event.currentTarget.value),
    onBlur: async () => {
      if (draft !== null && (await save(draft))) cancel();
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
