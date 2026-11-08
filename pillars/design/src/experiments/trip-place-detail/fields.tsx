import { ComboboxSelect, Textarea, TextInput } from '@pops/ui';

import { useIdea } from './context';
import { ideaKinds, ideaPurposes, ideaStatuses } from './fixture';

import type { FocusEvent } from 'react';

/** Direct source text edits commit on blur and leave unchanged values out of undo history. */
export function IdeaText({
  field,
  label,
}: {
  field: 'name' | 'reason' | 'address' | 'notes';
  label: string;
}) {
  const { state, change } = useIdea();
  const props = {
    'aria-label': label,
    defaultValue: state[field],
    onBlur: (event: FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (event.currentTarget.value !== state[field])
        change({ ...state, [field]: event.currentTarget.value });
    },
  };
  return field === 'reason' || field === 'notes' ? (
    <label className="block space-y-1 text-sm">
      <span className="font-medium">{label}</span>
      <Textarea key={state[field]} {...props} />
    </label>
  ) : (
    <TextInput
      key={state[field]}
      label={field === 'name' ? undefined : label}
      className={field === 'name' ? 'text-xl md:text-xl font-semibold' : undefined}
      variant="ghost"
      containerClassName="bg-transparent"
      {...props}
    />
  );
}

/** Kind, purpose and plan inclusion are explicit selections, with no booking state inferred. */
export function IdeaSelectors() {
  const { state, change } = useIdea();
  return (
    <div className="flex flex-wrap gap-2">
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
      <ComboboxSelect
        aria-label="Purpose"
        options={ideaPurposes}
        value={state.purpose}
        variant="ghost"
        onChange={(value) => {
          const option = ideaPurposes.find((item) => item.value === value);
          if (option && option.value !== state.purpose) change({ ...state, purpose: option.value });
        }}
      />
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
