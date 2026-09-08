import { cn } from '../lib/utils';
import { Chip } from './Chip';
import { type useChipInputSuggestions } from './ChipInput.suggestions.hooks';
import { ChipInputSuggestionsPopover } from './ChipInput.suggestions.popover';

import type { Ref } from 'react';

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

export interface ChipInputSuggestionsBodyProps {
  chip: ChipInputSuggestionsState;
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

/**
 * The combobox shell for `ChipInput` when it is given `suggestions`: a
 * bordered chip box whose free-text input is wired to a Radix `Popover` +
 * cmdk `Command` dropdown (`ChipInputSuggestionsPopover`). Purely
 * presentational — all state comes from `chip` (`useChipInputSuggestions`),
 * called once by the caller, so switching a `ChipInput` between this shell
 * and its plain (no-suggestions) one never remounts that state.
 */
export function ChipInputSuggestionsBody({
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
