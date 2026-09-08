/**
 * ChipInput component for multi-value input like email tags
 * Similar to Gmail's "To" field where entries become chips
 */
import { cva, type VariantProps } from 'class-variance-authority';
import { forwardRef, type InputHTMLAttributes } from 'react';

import { cn } from '../lib/utils';
import { Chip } from './Chip';
import { useChipInput } from './ChipInput.hooks';
import {
  ChipInputWithSuggestions,
  type ChipInputWithSuggestionsProps,
} from './ChipInput.suggestions';

import type { ChipInputSuggestion } from './ChipInput.suggestions.hooks';

export type { ChipInputSuggestion };

const containerVariants = cva(
  'flex flex-wrap items-center gap-2 w-full bg-background text-foreground transition-all outline-0 focus-within:outline-0 ring-0 focus-within:ring-0 p-2 min-h-11',
  {
    variants: {
      variant: {
        default: 'border border-border',
        ghost: 'border-0 hover:bg-accent',
        underline: 'border-0 border-b border-border rounded-none',
      },
      shape: {
        default: 'rounded-md',
        pill: 'rounded-full',
      },
    },
    compoundVariants: [{ variant: 'underline', shape: 'pill', class: 'rounded-none' }],
    defaultVariants: { variant: 'default', shape: 'default' },
  }
);

const inputVariants = cva(
  'flex-1 bg-transparent border-0 outline-0 shadow-none focus:outline-0 focus:ring-0 focus:shadow-none focus-visible:outline-0 focus-visible:ring-0 placeholder:text-muted-foreground disabled:cursor-not-allowed min-w-30',
  {
    variants: {
      size: { sm: 'text-xs', default: 'text-sm', lg: 'text-base' },
    },
    defaultVariants: { size: 'default' },
  }
);

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
   * When supplied, `ChipInput` renders as a combobox (Radix `Popover` + cmdk
   * `Command`) with arrow-key navigation, Enter-to-commit, Escape and
   * click-outside dismissal, and `role="combobox"`/`listbox` semantics — a
   * typed value that matches none of these can still be committed as a chip.
   * Omit it to keep the plain free-text `ChipInput` with no dropdown.
   */
  suggestions?: ChipInputSuggestion[];
  /**
   * Normalises a value right before it becomes a chip — applied to both a
   * typed free-text value and a picked suggestion. Only used when
   * `suggestions` is supplied. Defaults to a trim.
   */
  normalize?: ChipInputWithSuggestionsProps['normalize'];
  /** Message shown when no suggestion matches. Only used with `suggestions`. */
  suggestionsEmptyMessage?: string;
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

type PlainChipInputProps = Omit<
  ChipInputProps,
  'suggestions' | 'normalize' | 'suggestionsEmptyMessage'
>;

const PlainChipInput = forwardRef<HTMLInputElement, PlainChipInputProps>(
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
      delimiters = ['Enter', ',', 'Tab'],
      allowDuplicates = false,
      chipVariant = 'default',
      placeholder,
      disabled,
      ...props
    },
    ref
  ) => {
    const chip = useChipInput({
      controlledValue,
      defaultValue,
      onChange,
      onValidate,
      delimiters,
      allowDuplicates,
    });

    const setRefs = (node: HTMLInputElement | null) => {
      if (typeof ref === 'function') ref(node);
      else if (ref) ref.current = node;
      chip.inputRef.current = node;
    };

    return (
      <div
        className={cn(
          containerVariants({ variant, shape }),
          disabled && 'opacity-50 cursor-not-allowed',
          containerClassName
        )}
        style={chip.isFocused ? { borderColor: 'var(--ring)' } : undefined}
        onClick={() => chip.inputRef.current?.focus()}
      >
        <ChipList values={chip.values} chipVariant={chipVariant} onRemove={chip.removeChip} />
        <input
          ref={setRefs}
          type="text"
          className={cn(inputVariants({ className }))}
          value={chip.inputValue}
          onChange={(e) => chip.setInputValue(e.target.value)}
          onKeyDown={chip.handleKeyDown}
          onFocus={() => chip.setIsFocused(true)}
          onBlur={chip.handleBlur}
          onPaste={chip.handlePaste}
          disabled={disabled}
          placeholder={chip.values.length === 0 ? placeholder : undefined}
          {...props}
        />
      </div>
    );
  }
);

PlainChipInput.displayName = 'PlainChipInput';

/**
 * ChipInput component
 *
 * Renders as a plain free-text chip field, or — when `suggestions` is
 * supplied — as a combobox with a filtered suggestions dropdown built on
 * the same Radix `Popover` + cmdk `Command` primitives as `ComboboxSelect`
 * and `Autocomplete`.
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
export const ChipInput = forwardRef<HTMLInputElement, ChipInputProps>((props, ref) => {
  const { suggestions, normalize, suggestionsEmptyMessage, variant, shape, ...shared } = props;

  if (suggestions) {
    return (
      <ChipInputWithSuggestions
        {...shared}
        ref={ref}
        suggestions={suggestions}
        normalize={normalize}
        emptyMessage={suggestionsEmptyMessage}
      />
    );
  }

  return <PlainChipInput {...shared} variant={variant} shape={shape} ref={ref} />;
});

ChipInput.displayName = 'ChipInput';
