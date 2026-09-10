import { FieldError, fieldErrorId } from './FieldError';

export interface FieldLabelProps {
  /** `id` of the control this label describes. Also used to derive the
   * `id`s of the error and description paragraphs below, so a consumer can
   * wire `aria-describedby={fieldLabelDescribedBy(htmlFor, { error, description })}`
   * on the control itself. */
  htmlFor: string;
  /** Visible label text. Nothing renders when omitted. */
  label?: string;
  /** Whether to show a required marker next to the label. No-op without `label`. */
  required?: boolean;
  /**
   * Error message, rendered inside the label block and therefore ABOVE the
   * control. For a control with an `error` prop of its own — `TextInput`,
   * `DateInput`, `TimeInput`, `DateTimeInput` — pass it there instead, which
   * renders it below the control where every other kit input puts it
   * (POPS-3247). This slot is for the controls that have no such prop.
   *
   * Takes precedence over `description` when both are set.
   */
  error?: string;
  /** Optional hint/description line, hidden while an `error` is present. */
  description?: string;
}

/**
 * The `id`s of the paragraphs {@link FieldLabel} renders for `error` and
 * `description`, given the same `htmlFor` and slot presence passed to it.
 * Use this to wire `aria-describedby` on the control `htmlFor` points at.
 */
export function fieldLabelDescribedBy(
  htmlFor: string,
  slots: { error?: string; description?: string }
): string | undefined {
  const ids: string[] = [];
  if (slots.error) ids.push(fieldErrorId(htmlFor));
  else if (slots.description) ids.push(`${htmlFor}-description`);
  return ids.length > 0 ? ids.join(' ') : undefined;
}

/**
 * Shared label for form controls that associate via `htmlFor`/`id`, with
 * optional required marker, error message, and description/hint slots.
 * Renders nothing when none of `label`, `error`, or `description` is set.
 */
export function FieldLabel({ htmlFor, label, required, error, description }: FieldLabelProps) {
  if (!label && !error && !description) return null;
  const showDescription = !!description && !error;

  return (
    <>
      {label && (
        <label
          htmlFor={htmlFor}
          className="text-xs font-semibold text-muted-foreground uppercase tracking-widest ml-1"
        >
          {label}
          {required && (
            <span aria-hidden="true" className="text-destructive">
              {' '}
              *
            </span>
          )}
        </label>
      )}
      {showDescription && (
        <p id={`${htmlFor}-description`} className="text-2xs text-muted-foreground ml-1">
          {description}
        </p>
      )}
      <FieldError htmlFor={htmlFor} error={error} />
    </>
  );
}
