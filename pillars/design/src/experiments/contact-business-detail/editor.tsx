import { Pencil, Plus } from 'lucide-react';
import { useState } from 'react';

import {
  Button,
  ComboboxSelect,
  Popover,
  PopoverContent,
  PopoverTrigger,
  TextInput,
} from '@pops/ui';

/** Describes explicit source fields for this prototype's compact record editors. */
export interface BusinessEditorField {
  key: string;
  label: string;
  options?: { value: string; label: string }[];
  placeholder?: string;
}
interface EditorProps {
  label: string;
  values: Record<string, string>;
  fields: BusinessEditorField[];
  validationMessage: string;
  save: (draft: Record<string, string>) => boolean;
  remove?: () => void;
  add?: boolean;
}

/** Opens a local record draft; invalid saves remain open and never enter history. */
export function BusinessEditor(props: EditorProps) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" className="min-h-11 min-w-11" aria-label={props.label}>
          {props.add ? (
            <Plus className="size-4" aria-hidden />
          ) : (
            <Pencil className="size-4" aria-hidden />
          )}
          {props.add && props.label}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 max-w-full space-y-3">
        <h3 className="font-medium">{props.label}</h3>
        <EditorForm {...props} close={() => setOpen(false)} />
      </PopoverContent>
    </Popover>
  );
}

function EditorForm({
  values,
  fields,
  save,
  remove,
  validationMessage,
  close,
}: EditorProps & { close: () => void }) {
  const [draft, setDraft] = useState(values);
  const [error, setError] = useState(false);
  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (save(draft)) close();
        else setError(true);
      }}
    >
      {fields.map((field) => (
        <EditorField
          key={field.key}
          field={field}
          value={draft[field.key] ?? ''}
          update={(value) => setDraft({ ...draft, [field.key]: value })}
        />
      ))}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {validationMessage}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button className="min-h-11" type="submit">
          Save
        </Button>
        <Button className="min-h-11" variant="outline" type="button" onClick={close}>
          Cancel
        </Button>
        {remove && (
          <Button
            className="min-h-11"
            variant="ghost"
            type="button"
            onClick={() => {
              remove();
              close();
            }}
          >
            Remove
          </Button>
        )}
      </div>
    </form>
  );
}

function EditorField({
  field,
  value,
  update,
}: {
  field: BusinessEditorField;
  value: string;
  update: (value: string) => void;
}) {
  return field.options ? (
    <div className="space-y-1">
      <span className="text-sm">{field.label}</span>
      <ComboboxSelect
        aria-label={field.label}
        className="min-h-11"
        options={field.options}
        value={value}
        placeholder={field.placeholder}
        onChange={(next) => {
          if (typeof next === 'string') update(next);
        }}
      />
    </div>
  ) : (
    <TextInput
      label={field.label}
      value={value}
      onChange={(event) => update(event.currentTarget.value)}
    />
  );
}
