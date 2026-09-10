/**
 * Autocomplete component - Text input with suggestions using shadcn primitives
 * Built on Popover + Command for proper positioning and filtering
 */
import { useRef, useState } from 'react';

import { cn } from '../lib/utils';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '../primitives/command';
import { Popover, PopoverContent, PopoverTrigger } from '../primitives/popover';

export interface AutocompleteSuggestion {
  label: string;
  value: string;
  description?: string;
  disabled?: boolean;
}

export interface AutocompleteProps {
  /**
   * `id` for the underlying input, so a `<label htmlFor>` (or an
   * `aria-labelledby` elsewhere) can name it.
   */
  id?: string;
  /**
   * Accessible name when there is no visible `<label>` to point at.
   */
  'aria-label'?: string;
  /**
   * Accessible name sourced from another element's text.
   */
  'aria-labelledby'?: string;
  /**
   * Available suggestions
   */
  suggestions: AutocompleteSuggestion[];
  /**
   * Current value
   */
  value?: string;
  /**
   * Callback when value changes
   */
  onChange?: (value: string) => void;
  /**
   * Callback when a suggestion is selected
   */
  onSelect?: (suggestion: AutocompleteSuggestion) => void;
  /**
   * Placeholder text
   */
  placeholder?: string;
  /**
   * Empty message
   */
  emptyMessage?: string;
  /**
   * Suppresses the empty message while a suggestion fetch is in flight, so a
   * momentarily-empty `suggestions` array (debounce + network round-trip)
   * doesn't flash "no results" before real results arrive.
   */
  loading?: boolean;
  /**
   * Disabled state
   */
  disabled?: boolean;
  /**
   * Container className
   */
  className?: string;
}

/**
 * Autocomplete component
 *
 * @example
 * ```tsx
 * <Autocomplete
 *   suggestions={suggestions}
 *   value={value}
 *   onChange={setValue}
 *   onSelect={(item) => console.log(item)}
 *   placeholder="Start typing..."
 * />
 * ```
 */
function SuggestionItems({
  suggestions,
  onPick,
}: {
  suggestions: AutocompleteSuggestion[];
  onPick: (s: AutocompleteSuggestion) => void;
}) {
  return (
    <CommandGroup>
      {suggestions.map((suggestion) => (
        <CommandItem
          key={suggestion.value}
          value={suggestion.label}
          onSelect={() => {
            if (!suggestion.disabled) onPick(suggestion);
          }}
          disabled={suggestion.disabled}
        >
          <div className="flex flex-col">
            <span>{suggestion.label}</span>
            {suggestion.description && (
              <span className="text-xs text-muted-foreground">{suggestion.description}</span>
            )}
          </div>
        </CommandItem>
      ))}
    </CommandGroup>
  );
}

function useAutocompleteState({
  value,
  onChange,
  onSelect,
}: {
  value: string;
  onChange?: (value: string) => void;
  onSelect?: (suggestion: AutocompleteSuggestion) => void;
}) {
  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState(value);
  const [lastValue, setLastValue] = useState(value);

  if (value !== lastValue) {
    setLastValue(value);
    setInputValue(value);
  }

  const handleInputChange = (newValue: string) => {
    setInputValue(newValue);
    onChange?.(newValue);
    if (!open && newValue) setOpen(true);
  };

  const handleSelect = (suggestion: AutocompleteSuggestion) => {
    setInputValue(suggestion.label);
    onChange?.(suggestion.label);
    onSelect?.(suggestion);
    setOpen(false);
  };

  return { open, setOpen, inputValue, handleInputChange, handleSelect };
}

export function Autocomplete({
  id,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
  suggestions,
  value = '',
  onChange,
  onSelect,
  placeholder = 'Search...',
  emptyMessage = 'No results found.',
  loading = false,
  disabled = false,
  className,
}: AutocompleteProps) {
  const { open, setOpen, inputValue, handleInputChange, handleSelect } = useAutocompleteState({
    value,
    onChange,
    onSelect,
  });
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Command className={cn('overflow-visible bg-transparent', className)}>
        <PopoverTrigger asChild>
          <CommandInput
            ref={inputRef}
            id={id}
            aria-label={ariaLabel}
            aria-labelledby={ariaLabelledBy}
            value={inputValue}
            onValueChange={handleInputChange}
            onFocus={() => inputValue && setOpen(true)}
            placeholder={placeholder}
            disabled={disabled}
            className="h-10"
          />
        </PopoverTrigger>
        <PopoverContent
          className="w-[var(--radix-popover-trigger-width)] p-0"
          side="bottom"
          align="start"
          onOpenAutoFocus={(e: Event) => e.preventDefault()}
        >
          <CommandList>
            {!loading && <CommandEmpty>{emptyMessage}</CommandEmpty>}
            <SuggestionItems suggestions={suggestions} onPick={handleSelect} />
          </CommandList>
        </PopoverContent>
      </Command>
    </Popover>
  );
}
