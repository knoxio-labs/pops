/**
 * ChipInput component for multi-value input like email tags
 * Similar to Gmail's "To" field where entries become chips
 */
import { type VariantProps } from 'class-variance-authority';
import { forwardRef, type InputHTMLAttributes } from 'react';

import { ChipInputBody } from './ChipInput.suggestions';
import { type ChipInputSuggestion, useChipInputSuggestions } from './ChipInput.suggestions.hooks';
import { inputVariants } from './ChipInput.variants';

import type { containerVariants } from './ChipInput.variants';

export type { ChipInputSuggestion };

export interface ChipInputProps
  extends
    Omit<InputHTMLAttributes<HTMLInputElement>, 'size' | 'value' | 'onChange'>,
    VariantProps<typeof containerVariants> {
  value?: string[];
  defaultValue?: string[];
  onChange?: (values: string[]) => void;
  onValidate?: (value: string) => boolean;
  delimiters?: string[];
  allowDuplicates?: boolean;
  chipVariant?: 'default' | 'primary' | 'success';
  containerClassName?: string;
  /**
   * Existing values to suggest in a filtered dropdown as the user types.
   * `ChipInput` always renders as a combobox (Radix `Popover` + cmdk
   * `Command`) with arrow-key navigation, Enter-to-commit, Escape and
   * click-outside dismissal, and `role="combobox"`/`listbox` semantics — a
   * typed value that matches none of these can still be committed as a chip.
   * Omit `suggestions` (or pass `[]`) to keep the field free-text: the
   * dropdown then simply never opens. Safe to populate asynchronously —
   * going from `undefined`/`[]` to a loaded list never remounts the `<input>`
   * DOM node or drops in-progress focus and typed text, since there is only
   * ever one rendered shell, driven by one `useChipInputSuggestions` hook
   * instance.
   */
  suggestions?: ChipInputSuggestion[];
  /**
   * Normalises a value right before it becomes a chip — applied to a typed
   * free-text value and a picked suggestion alike, and regardless of
   * whether Enter, a delimiter key (comma/Tab by default), or blur
   * committed it. Only used when `suggestions` is supplied. Defaults to a
   * trim.
   */
  normalize?: (raw: string) => string;
  /** Message shown when no suggestion matches. Only used with `suggestions`. */
  suggestionsEmptyMessage?: string;
}

/**
 * ChipInput component
 *
 * Always renders as a combobox with a filtered suggestions dropdown, built
 * on the same Radix `Popover` + cmdk `Command` primitives as
 * `ComboboxSelect` and `Autocomplete` — whether or not the caller ever
 * passes `suggestions`. There is exactly one rendered shell and one
 * `useChipInputSuggestions` hook instance, so the underlying `<input>` DOM
 * node stays mounted at a stable tree position across every `suggestions`
 * change (e.g. an async fetch resolving mid-type): React never sees a
 * different component type at that position, so it never unmounts and
 * remounts the field, and neither the field's React state nor real browser
 * keyboard focus is lost.
 *
 * @example
 * ```tsx
 * <ChipInput placeholder="Add emails..." />
 * <ChipInput value={emails} onChange={setEmails} />
 * <ChipInput
 *   value={tags}
 *   onChange={setTags}
 *   suggestions={[{ label: 'urgent', value: 'urgent' }]}
 *   normalize={(v) => v.trim().toLowerCase().replace(/\s+/g, '-')}
 * />
 * ```
 */
export const ChipInput = forwardRef<HTMLInputElement, ChipInputProps>(
  (
    {
      className,
      containerClassName,
      variant,
      shape,
      value: controlledValue,
      defaultValue = [],
      onChange,
      onValidate,
      normalize,
      delimiters = ['Enter', ',', 'Tab'],
      allowDuplicates = false,
      chipVariant = 'default',
      placeholder,
      suggestions,
      suggestionsEmptyMessage = 'No matching suggestions.',
      disabled,
      ...domProps
    },
    ref
  ) => {
    const ariaLabel = domProps['aria-label'];
    const chip = useChipInputSuggestions({
      controlledValue,
      defaultValue,
      onChange,
      onValidate,
      delimiters,
      allowDuplicates,
      suggestions: suggestions ?? [],
      normalize: normalize ?? ((raw: string) => raw.trim()),
    });

    return (
      <ChipInputBody
        chip={chip}
        forwardedRef={ref}
        variant={variant}
        shape={shape}
        chipVariant={chipVariant}
        containerClassName={containerClassName}
        disabled={disabled}
        placeholder={placeholder}
        domProps={domProps}
        ariaLabel={ariaLabel}
        inputClassName={inputVariants({ className })}
        emptyMessage={suggestionsEmptyMessage}
      />
    );
  }
);

ChipInput.displayName = 'ChipInput';
