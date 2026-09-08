import { Command as CommandPrimitive } from 'cmdk';
import { type KeyboardEvent, type Ref } from 'react';

import { cn } from '../lib/utils';
import { CommandEmpty, CommandGroup, CommandItem, CommandList } from '../primitives/command';
import { Popover, PopoverAnchor, PopoverContent } from '../primitives/popover';

import type { ChipInputSuggestion } from './ChipInput.suggestions.hooks';

function SuggestionList({
  suggestions,
  onPick,
}: {
  suggestions: ChipInputSuggestion[];
  onPick: (s: ChipInputSuggestion) => void;
}) {
  return (
    <CommandGroup>
      {suggestions.map((suggestion) => (
        <CommandItem
          key={suggestion.value}
          value={suggestion.value}
          keywords={[suggestion.label]}
          disabled={suggestion.disabled}
          onSelect={() => onPick(suggestion)}
        >
          {suggestion.label}
        </CommandItem>
      ))}
    </CommandGroup>
  );
}

export interface ChipInputSuggestionsPopoverProps {
  open: boolean;
  setOpen: (v: boolean) => void;
  ariaLabel?: string;
  inputRef: Ref<HTMLInputElement>;
  inputClassName: string;
  inputValue: string;
  onValueChange: (next: string) => void;
  onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void;
  onFocus: () => void;
  onBlur: () => void;
  onPaste: (e: React.ClipboardEvent<HTMLInputElement>) => void;
  disabled?: boolean;
  placeholder?: string;
  emptyMessage: string;
  filtered: ChipInputSuggestion[];
  onPick: (s: ChipInputSuggestion) => void;
  inputProps: Record<string, unknown>;
}

/**
 * The Radix `Popover` + cmdk `Command` shell for `ChipInputWithSuggestions`
 * — split out from the container so the container's render function stays
 * under the repo's function-length limit.
 */
export function ChipInputSuggestionsPopover({
  open,
  setOpen,
  ariaLabel,
  inputRef,
  inputClassName,
  inputValue,
  onValueChange,
  onKeyDown,
  onFocus,
  onBlur,
  onPaste,
  disabled,
  placeholder,
  emptyMessage,
  filtered,
  onPick,
  inputProps,
}: ChipInputSuggestionsPopoverProps) {
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <CommandPrimitive shouldFilter={false} className="contents" label={ariaLabel}>
        <PopoverAnchor asChild>
          <CommandPrimitive.Input
            ref={inputRef}
            className={cn(inputClassName)}
            value={inputValue}
            onValueChange={onValueChange}
            onKeyDown={onKeyDown}
            onFocus={onFocus}
            onBlur={onBlur}
            onPaste={onPaste}
            disabled={disabled}
            placeholder={placeholder}
            aria-label={ariaLabel}
            {...inputProps}
          />
        </PopoverAnchor>
        <PopoverContent
          className="w-[var(--radix-popover-trigger-width)] p-0"
          side="bottom"
          align="start"
          onOpenAutoFocus={(e: Event) => e.preventDefault()}
        >
          <CommandList>
            <CommandEmpty>{emptyMessage}</CommandEmpty>
            <SuggestionList suggestions={filtered} onPick={onPick} />
          </CommandList>
        </PopoverContent>
      </CommandPrimitive>
    </Popover>
  );
}
