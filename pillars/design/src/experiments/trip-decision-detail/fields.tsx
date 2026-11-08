import { useEffect, useRef, useState } from 'react';

import { Button, Textarea, TextInput } from '@pops/ui';

/** Source text stays readable until activated; blur commits and Escape cancels. */
export function DecisionText({
  value,
  label,
  onCommit,
  multiline = false,
  heading = false,
}: {
  value: string;
  label: string;
  onCommit: (value: string) => void;
  multiline?: boolean;
  heading?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const input = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const cancelled = useRef(false);
  useEffect(() => {
    if (editing) input.current?.focus();
  }, [editing]);
  if (!editing)
    return (
      <Button
        variant="ghost"
        aria-label={`Edit ${label}`}
        className={`h-auto min-h-11 w-full justify-start whitespace-pre-wrap px-2 py-2 text-left ${heading ? 'text-xl font-semibold' : 'text-sm font-normal'}`}
        onClick={() => {
          cancelled.current = false;
          setEditing(true);
        }}
      >
        {value || `Add ${label.toLowerCase()}`}
      </Button>
    );
  const props = {
    'aria-label': label,
    defaultValue: value,
    onBlur: (event: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (!cancelled.current && event.currentTarget.value !== value)
        onCommit(event.currentTarget.value);
      setEditing(false);
    },
    onKeyDown: (event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (event.key === 'Escape') {
        cancelled.current = true;
        setEditing(false);
      }
      if (event.key === 'Enter' && (!multiline || event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        event.currentTarget.blur();
      }
    },
    ref: (node: HTMLInputElement | HTMLTextAreaElement | null) => {
      input.current = node;
    },
  };
  return multiline ? <Textarea {...props} /> : <TextInput {...props} />;
}
