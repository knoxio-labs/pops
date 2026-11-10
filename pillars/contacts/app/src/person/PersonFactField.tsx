import { Textarea, TextInput } from '@pops/ui';

/** Keep literal field editing accessible and retain every explicit change in the shared draft. */
export function PersonFactField({
  label,
  value,
  disabled,
  change,
  multiline = false,
}: {
  label: string;
  value: string;
  disabled: boolean;
  change: (value: string) => void;
  multiline?: boolean;
}) {
  if (multiline)
    return (
      <Textarea
        aria-label={label}
        value={value}
        placeholder={label}
        disabled={disabled}
        rows={1}
        className="min-h-11 border-transparent bg-transparent text-sm shadow-none"
        onChange={(event) => change(event.currentTarget.value)}
      />
    );
  return (
    <TextInput
      aria-label={label}
      variant="ghost"
      containerClassName="min-h-11 min-w-0 flex-1"
      className="text-sm"
      value={value}
      placeholder={label}
      disabled={disabled}
      onChange={(event) => {
        if (event.currentTarget.value !== value) change(event.currentTarget.value);
      }}
    />
  );
}
