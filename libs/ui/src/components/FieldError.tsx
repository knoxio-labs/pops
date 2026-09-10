/** The `id` of the paragraph {@link FieldError} renders for a control. */
export function fieldErrorId(htmlFor: string): string {
  return `${htmlFor}-error`;
}

export interface FieldErrorProps {
  /** `id` of the control this message is about, used to derive the paragraph's own. */
  htmlFor: string;
  /** The message. Nothing renders when absent or empty. */
  error?: string;
}

/**
 * A form control's error message, in one place.
 *
 * The markup was written out three times — in {@link FieldLabel}, in
 * `TextInput` and (from POPS-3247) in the date/time inputs — which is three
 * chances for them to disagree, and they already had: `TextInput`'s copy
 * carried neither the `id` an `aria-describedby` could point at nor the
 * `role="alert"` that makes a screen reader announce it.
 *
 * **Where it renders is the caller's decision, and there is one right answer**:
 * below the control. Every kit input that owns an `error` prop renders it
 * there, and a form mixing one that does with one that does not shows two
 * messages in the same row at different heights (POPS-3247). `FieldLabel`
 * still has an error slot for controls with no `error` prop of their own — a
 * `Select`, a `Combobox` — and that slot necessarily renders inside the label
 * block, above the control. Prefer the input's own prop wherever it has one.
 */
export function FieldError({ htmlFor, error }: FieldErrorProps) {
  if (!error) return null;
  return (
    <p
      id={fieldErrorId(htmlFor)}
      role="alert"
      className="text-2xs font-medium text-destructive ml-1"
    >
      {error}
    </p>
  );
}
