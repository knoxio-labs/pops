import { cva } from 'class-variance-authority';
import { forwardRef, type InputHTMLAttributes, type Ref } from 'react';

import { cn } from '../lib/utils';
import { Chip } from './Chip';
import { type ChipInputSuggestion, useChipInputSuggestions } from './ChipInput.suggestions.hooks';
import { ChipInputSuggestionsPopover } from './ChipInput.suggestions.popover';

const inputVariants = cva(
  'flex-1 bg-transparent border-0 outline-0 shadow-none focus:outline-0 focus:ring-0 focus:shadow-none focus-visible:outline-0 focus-visible:ring-0 placeholder:text-muted-foreground disabled:cursor-not-allowed min-w-30',
  {
    variants: {
      size: { sm: 'text-xs', default: 'text-sm', lg: 'text-base' },
    },
    defaultVariants: { size: 'default' },
  }
);

export interface ChipInputWithSuggestionsProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'size' | 'value' | 'onChange'
> {
  suggestions: ChipInputSuggestion[];
  value?: string[];
  defaultValue?: string[];
  onChange?: (values: string[]) => void;
  onValidate?: (value: string) => boolean;
  /**
   * Normalises a value right before it becomes a chip — applied both to a
   * typed free-text value and to a picked suggestion. Defaults to a trim.
   * Pass e.g. `(v) => v.trim().toLowerCase().replace(/\s+/g, '-')` to match
   * the trim/lowercase/hyphenate convention used elsewhere in the app.
   */
  normalize?: (raw: string) => string;
  delimiters?: string[];
  allowDuplicates?: boolean;
  chipVariant?: 'default' | 'primary' | 'success';
  containerClassName?: string;
  emptyMessage?: string;
  size?: 'sm' | 'default' | 'lg';
  /** Accessible name for the combobox input. */
  'aria-label'?: string;
}

function ChipList({
  values,
  chipVariant,
  onRemove,
}: {
  values: string[];
  chipVariant: 'default' | 'primary' | 'success';
  onRemove: (i: number) => void;
}) {
  return (
    <>
      {values.map((value, index) => (
        <Chip
          key={`${value}-${index}`}
          variant={chipVariant}
          size="sm"
          removable
          onRemove={() => onRemove(index)}
        >
          {value}
        </Chip>
      ))}
    </>
  );
}

function mergeInputRef(forwarded: Ref<HTMLInputElement>, inner: Ref<HTMLInputElement>) {
  return (node: HTMLInputElement | null) => {
    if (typeof forwarded === 'function') forwarded(node);
    else if (forwarded) forwarded.current = node;
    if (typeof inner === 'function') inner(node);
  };
}

type ChipState = ReturnType<typeof useChipInputSuggestions>;

interface ChipInputSuggestionsBodyProps {
  chip: ChipState;
  forwardedRef: Ref<HTMLInputElement>;
  chipVariant: 'default' | 'primary' | 'success';
  containerClassName?: string;
  disabled?: boolean;
  ariaLabel?: string;
  inputClassName: string;
  placeholder?: string;
  emptyMessage: string;
  domProps: Record<string, unknown>;
}

function ChipInputSuggestionsBody({
  chip,
  forwardedRef,
  chipVariant,
  containerClassName,
  disabled,
  ariaLabel,
  inputClassName,
  placeholder,
  emptyMessage,
  domProps,
}: ChipInputSuggestionsBodyProps) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-2 w-full bg-background text-foreground transition-all outline-0 focus-within:outline-0 ring-0 focus-within:ring-0 p-2 min-h-11 rounded-md border border-border',
        disabled && 'opacity-50 cursor-not-allowed',
        containerClassName
      )}
      style={chip.isFocused ? { borderColor: 'var(--ring)' } : undefined}
      onClick={() => chip.inputRef.current?.focus()}
    >
      <ChipList values={chip.values} chipVariant={chipVariant} onRemove={chip.removeChip} />
      <ChipInputSuggestionsPopover
        open={chip.open}
        setOpen={chip.setOpen}
        ariaLabel={ariaLabel}
        inputRef={mergeInputRef(forwardedRef, (node) => {
          chip.inputRef.current = node;
        })}
        inputClassName={inputClassName}
        inputValue={chip.inputValue}
        onValueChange={chip.handleInputChange}
        onKeyDown={chip.handleKeyDown}
        onFocus={chip.handleFocus}
        onBlur={chip.handleBlur}
        onPaste={chip.handlePaste}
        disabled={disabled}
        placeholder={chip.values.length === 0 ? placeholder : undefined}
        emptyMessage={emptyMessage}
        filtered={chip.filtered}
        onPick={chip.pickSuggestion}
        inputProps={domProps}
      />
    </div>
  );
}

/**
 * ChipInput variant with a filtered suggestions dropdown, built on the same
 * Radix Popover + cmdk Command primitives as `ComboboxSelect`/`Autocomplete`.
 * Free-text values not in `suggestions` can still be committed as chips.
 */
export const ChipInputWithSuggestions = forwardRef<HTMLInputElement, ChipInputWithSuggestionsProps>(
  (
    {
      className,
      containerClassName,
      suggestions,
      value: controlledValue,
      defaultValue = [],
      onChange,
      onValidate,
      normalize,
      delimiters = ['Enter', ',', 'Tab'],
      allowDuplicates = false,
      chipVariant = 'default',
      placeholder,
      emptyMessage = 'No matching suggestions.',
      disabled,
      size = 'default',
      'aria-label': ariaLabel,
      ...domProps
    },
    ref
  ) => {
    const chip = useChipInputSuggestions({
      controlledValue,
      defaultValue,
      onChange,
      onValidate,
      delimiters,
      allowDuplicates,
      suggestions,
      normalize: normalize ?? ((raw: string) => raw.trim()),
    });

    return (
      <ChipInputSuggestionsBody
        chip={chip}
        forwardedRef={ref}
        chipVariant={chipVariant}
        containerClassName={containerClassName}
        disabled={disabled}
        ariaLabel={ariaLabel}
        inputClassName={inputVariants({ size, className })}
        placeholder={placeholder}
        emptyMessage={emptyMessage}
        domProps={domProps}
      />
    );
  }
);

ChipInputWithSuggestions.displayName = 'ChipInputWithSuggestions';
