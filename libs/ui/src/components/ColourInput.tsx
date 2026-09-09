/**
 * ColourInput — a hex colour text field paired with a native swatch,
 * following {@link TextInput}'s controlled/uncontrolled and label/`id`
 * conventions.
 *
 * The two affordances share one value and one validity rule: typing a hex
 * string updates the swatch once it is a well-formed `#rrggbb`, and picking
 * a colour from the swatch writes the hex text back. An invalid hex is
 * never silently swapped for a fallback colour — it surfaces through
 * `error` instead (the caller can still pass its own `error`, which takes
 * precedence over the built-in validation message), and the swatch keeps
 * showing the last colour that *was* valid until the text becomes valid
 * again.
 */
import { forwardRef, useId, useState, type InputHTMLAttributes } from 'react';

import { cn } from '../lib/utils';
import { TextInput } from './TextInput';

const HEX_COLOUR = /^#[0-9a-f]{6}$/i;

const FALLBACK_SWATCH_COLOUR = '#000000';

/** Whether `value` is a well-formed 6-digit hex colour (`#rrggbb`), case-insensitive. */
export function isValidHexColour(value: string): boolean {
  return HEX_COLOUR.test(value);
}

export interface ColourInputProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'size' | 'prefix' | 'type' | 'value' | 'defaultValue' | 'onChange'
> {
  /**
   * Current hex colour, e.g. `#1a2b3c`. Controlled mode: the parent owns
   * the value and must update it via `onChange`.
   */
  value?: string;
  /**
   * Initial hex colour. Uncontrolled mode: omit `value` and the component
   * owns its own state.
   */
  defaultValue?: string;
  /**
   * Called with the new hex text whenever either affordance changes it —
   * the text field on every keystroke, the swatch on every pick.
   */
  onChange?: (value: string) => void;
  /** Label for the hex text field. */
  label?: string;
  /**
   * Error message. When omitted, an invalid hex in the text field supplies
   * its own message here — this is what replaces the silent fallback to a
   * default colour.
   */
  error?: string;
  /** Container class name for the wrapping row (text field + swatch). */
  containerClassName?: string;
}

/**
 * ColourInput component
 *
 * @example
 * ```tsx
 * <ColourInput label="Colour" value={colour} onChange={setColour} />
 * ```
 */
export const ColourInput = forwardRef<HTMLInputElement, ColourInputProps>((props, ref) => {
  const {
    value: controlledValue,
    defaultValue,
    onChange,
    label,
    error,
    disabled,
    id,
    className,
    containerClassName,
    ...rest
  } = props;

  const [internalValue, setInternalValue] = useState(defaultValue ?? '');
  const isControlled = controlledValue !== undefined;
  const value = isControlled ? controlledValue : internalValue;

  // Derived from `value` on every render (the React-sanctioned "adjust
  // state during render" pattern) rather than an effect, so the swatch
  // never paints one frame behind a controlled value change. Lower-cased:
  // `<input type="color">`'s value attribute must be a "simple colour"
  // (lowercase ASCII hex) per the HTML spec — feeding it an uppercase hex
  // string reproduces the exact silent-black-swatch bug this component
  // exists to fix.
  const [lastValidColour, setLastValidColour] = useState(
    isValidHexColour(value) ? value.toLowerCase() : FALLBACK_SWATCH_COLOUR
  );
  if (isValidHexColour(value) && value.toLowerCase() !== lastValidColour) {
    setLastValidColour(value.toLowerCase());
  }

  const generatedId = useId();
  const inputId = id ?? generatedId;

  const setValue = (next: string) => {
    if (!isControlled) setInternalValue(next);
    onChange?.(next);
  };

  const validationError =
    value.length > 0 && !isValidHexColour(value) ? 'Enter a hex colour, e.g. #1a2b3c' : undefined;
  const shownError = error ?? validationError;

  return (
    <div className={cn('flex items-end gap-3', containerClassName)}>
      <div className="flex-1">
        <TextInput
          ref={ref}
          id={inputId}
          label={label}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={disabled}
          error={shownError}
          className={className}
          {...rest}
        />
      </div>
      <input
        type="color"
        value={lastValidColour}
        onChange={(e) => setValue(e.target.value)}
        disabled={disabled}
        aria-label={label ? `${label} swatch` : 'Colour swatch'}
        className="h-11 w-11 shrink-0 cursor-pointer rounded-md border border-input bg-transparent p-1 disabled:opacity-50 disabled:cursor-not-allowed"
      />
    </div>
  );
});

ColourInput.displayName = 'ColourInput';
