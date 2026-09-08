import { cn } from '../lib/utils';
import { Chip } from './Chip';
import { type useChipInputSuggestions } from './ChipInput.suggestions.hooks';
import { ChipInputSuggestionsPopover } from './ChipInput.suggestions.popover';
import { containerVariants } from './ChipInput.variants';

import type { Ref } from 'react';

import type { ChipInputShape, ChipInputVariant } from './ChipInput.variants';

export function ChipList({
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

export function mergeInputRef(forwarded: Ref<HTMLInputElement>, inner: Ref<HTMLInputElement>) {
  return (node: HTMLInputElement | null) => {
    if (typeof forwarded === 'function') forwarded(node);
    else if (forwarded) forwarded.current = node;
    if (typeof inner === 'function') inner(node);
  };
}

export type ChipInputSuggestionsState = ReturnType<typeof useChipInputSuggestions>;

export interface ChipInputBodyProps {
  chip: ChipInputSuggestionsState;
  forwardedRef: Ref<HTMLInputElement>;
  variant: ChipInputVariant;
  shape: ChipInputShape;
  chipVariant: 'default' | 'primary' | 'success';
  containerClassName?: string;
  disabled?: boolean;
  ariaLabel?: string;
  inputClassName: string;
  placeholder?: string;
  emptyMessage: string;
  domProps: Record<string, unknown>;
}

/**
 * The single rendered shell for `ChipInput`: a chip box whose free-text
 * input sits inside a Radix `Popover` + cmdk `Command` (`ChipInputSuggestionsPopover`)
 * at all times, whether or not the caller ever supplies `suggestions`. Only
 * the dropdown's open state — driven by `chip.open`, which never turns true
 * while there are no suggestions to show — decides whether the popover
 * content mounts. Keeping this the one and only shell means the underlying
 * `<input>` DOM node stays at a stable position in the tree across every
 * `suggestions` transition (`undefined`/`[]` to a populated array and back),
 * so an in-progress focus and keystroke survive a suggestions list arriving
 * asynchronously mid-type — React would otherwise treat a change of
 * component type at this position as an unmount/remount of the field. All
 * state comes from `chip` (`useChipInputSuggestions`), called once by the
 * caller.
 */
export function ChipInputBody({
  chip,
  forwardedRef,
  variant,
  shape,
  chipVariant,
  containerClassName,
  disabled,
  ariaLabel,
  inputClassName,
  placeholder,
  emptyMessage,
  domProps,
}: ChipInputBodyProps) {
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
