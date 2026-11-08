import { useEffect, useRef, useState } from 'react';

import { Button, ComboboxSelect, Textarea, TextInput } from '@pops/ui';

import { useIdea } from './context';
import { ideaKinds, ideaPurposes, ideaStatuses } from './fixture';

import type { FocusEvent, KeyboardEvent } from 'react';

type IdeaField = 'name' | 'reason' | 'address' | 'notes';

/** Show source text as content; click or keyboard activation edits that field directly. */
export function IdeaText({ field, label }: { field: IdeaField; label: string }) {
  const { state, change } = useIdea();
  const [editing, setEditing] = useState(false);
  const editor = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const cancelled = useRef(false);
  useEffect(() => {
    if (editing) editor.current?.focus();
  }, [editing]);
  const multiline = field === 'reason' || field === 'notes';
  const commit = (event: FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (!cancelled.current && event.currentTarget.value !== state[field])
      change({ ...state, [field]: event.currentTarget.value });
    setEditing(false);
  };
  const keys = (event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (event.key === 'Escape') {
      cancelled.current = true;
      setEditing(false);
    }
    if (event.key === 'Enter' && (!multiline || event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      event.currentTarget.blur();
    }
  };
  if (!editing)
    return (
      <Button
        variant="ghost"
        aria-label={`Edit ${label}`}
        className={`h-auto min-h-11 w-full justify-start whitespace-pre-wrap px-2 py-2 text-left ${field === 'name' ? 'text-xl font-semibold' : 'text-sm font-normal'}`}
        onClick={() => {
          cancelled.current = false;
          setEditing(true);
        }}
      >
        {state[field] || `Add ${label.toLowerCase()}`}
      </Button>
    );
  const props = {
    'aria-label': label,
    defaultValue: state[field],
    onBlur: commit,
    onKeyDown: keys,
  };
  return multiline ? (
    <Textarea
      ref={(node) => {
        editor.current = node;
      }}
      {...props}
    />
  ) : (
    <TextInput
      ref={(node) => {
        editor.current = node;
      }}
      {...props}
    />
  );
}

/** Labeled type and purpose choices distinguish classification from plan inclusion. */
export function IdeaSelectors() {
  const { state, change } = useIdea();
  return (
    <div className="flex flex-wrap gap-x-5 gap-y-2">
      <div>
        <p className="text-xs font-medium text-muted-foreground">Type</p>
        <ComboboxSelect
          aria-label="Idea type"
          options={ideaKinds}
          value={state.kind}
          variant="ghost"
          onChange={(value) => {
            const option = ideaKinds.find((item) => item.value === value);
            if (option && option.value !== state.kind) change({ ...state, kind: option.value });
          }}
        />
      </div>
      <div>
        <p className="text-xs font-medium text-muted-foreground">Purpose</p>
        <ComboboxSelect
          aria-label="Purpose"
          options={ideaPurposes}
          value={state.purpose}
          variant="ghost"
          onChange={(value) => {
            const option = ideaPurposes.find((item) => item.value === value);
            if (option && option.value !== state.purpose)
              change({ ...state, purpose: option.value });
          }}
        />
      </div>
    </div>
  );
}

/** Plan status stays an explicit soft intention, independent of place type and purpose. */
export function IdeaStatus() {
  const { state, change } = useIdea();
  return (
    <div className="shrink-0">
      <p className="text-xs font-medium text-muted-foreground">Status</p>
      <ComboboxSelect
        aria-label="Idea status"
        options={ideaStatuses}
        value={state.status}
        variant="outline"
        onChange={(value) => {
          const option = ideaStatuses.find((item) => item.value === value);
          if (option && option.value !== state.status) change({ ...state, status: option.value });
        }}
      />
    </div>
  );
}
