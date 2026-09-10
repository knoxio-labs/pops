/**
 * Autocomplete component - Text input with suggestions using shadcn primitives
 * Built on Popover + Command for proper positioning and filtering
 */
import { useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';

import { cn } from '../lib/utils';
import {
  Command,
  CommandBareInput,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '../primitives/command';
import { Popover, PopoverContent, PopoverTrigger } from '../primitives/popover';
import { containerVariants, inputVariants } from './TextInput.variants';

export interface AutocompleteSuggestion {
  label: string;
  value: string;
  description?: string;
  disabled?: boolean;
}

export interface AutocompleteProps {
  /**
   * `id` for the underlying input, so a `<label htmlFor>` (or an
   * `aria-labelledby` elsewhere) can name it. It lands on the `<input>`
   * itself, not on any wrapper.
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
   * What the list says when no suggestion matches.
   *
   * `null` says nothing at all, which is the answer for a field where free
   * text is valid — typing a unit that is not in the list is normal use, not
   * a failed search, and "No results found." reads as a refusal.
   *
   * Omitted, it falls back to the kit's own translated string rather than to
   * a hardcoded English one, so a consumer does not have to pass a
   * translation per call site to be localised.
   */
  emptyMessage?: string | null;
  /**
   * Which chrome the field wears.
   *
   * `'search'`, the default, is `CommandInput`'s full search layout: a
   * magnifier glyph and a bottom-rule-only box. `'bare'` drops both and wears
   * the kit's own text-field container instead, so a compact field sitting in
   * a row of `TextInput`s looks like one rather than announcing itself as a
   * search (POPS-3294). The two share `TextInput.variants`, so they match by
   * construction rather than by eye.
   */
  chrome?: 'search' | 'bare';
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

/**
 * Put the caller's `id` and `aria-labelledby` on the input, which is the one
 * thing that cannot be done by passing them.
 *
 * cmdk builds its input as `createElement(input, { ...callerProps, id:
 * ownId, 'aria-labelledby': ownLabelId, … })` — its own values are spread
 * LAST, so they win. Two consequences, both of which shipped:
 *
 * 1. An `id` passed to `Autocomplete` never reached the DOM, so a
 *    `<label htmlFor>` a consumer wrote pointed at nothing. `EndpointPicker`
 *    has rendered exactly that, associating with nothing, since it was
 *    written.
 * 2. The input's `aria-labelledby` pointed at cmdk's own visually-hidden
 *    `<label cmdk-label>`, which is EMPTY because nothing passes cmdk's
 *    `label` prop. An `aria-labelledby` resolving to the empty string beats
 *    `aria-label` in the accessible-name computation and leaves the field
 *    with no name at all — and WAI-ARIA gives `combobox` no
 *    name-from-content fallback, so there was nothing else for it to fall
 *    back to. Every `Autocomplete` in the repo was an unnamed combobox
 *    (POPS-3282).
 *
 * Correcting the two attributes on the element is what is left. Passing them
 * through `asChild` on cmdk's input does work — Radix's Slot merges child
 * props over cmdk's — but nesting that Slot inside `PopoverTrigger`'s costs
 * the trigger its focus behaviour: the popover then steals focus from the
 * field on the keystroke that opens it, and everything typed after the first
 * character is lost. Measured, not assumed.
 *
 * A layout effect with no dependency array, because React reapplies cmdk's
 * values on every render and this has to undo them again each time. It runs
 * before paint, so no frame shows the wrong attributes.
 */
function useCallerNaming(
  inputRef: RefObject<HTMLInputElement | null>,
  id: string | undefined,
  ariaLabelledBy: string | undefined
): void {
  // cmdk's own id, read once before anything overwrites it. React only writes
  // an attribute when the prop changed between renders, and cmdk's id never
  // does, so once this effect has replaced it React will not put it back — a
  // caller whose id becomes undefined would otherwise keep the old string
  // forever, which for a conditionally-derived id means two elements claiming
  // one id.
  const generatedId = useRef<string | null>(null);

  useLayoutEffect(() => {
    const input = inputRef.current;
    if (input === null) return;
    generatedId.current ??= input.id;
    if (id !== undefined) input.id = id;
    else if (generatedId.current !== '') input.id = generatedId.current;
    else input.removeAttribute('id');
    // Removed rather than left alone when the caller names the field some
    // other way: cmdk's target is empty, so leaving it would shadow both
    // `aria-label` and a native `<label for>`.
    if (ariaLabelledBy === undefined) input.removeAttribute('aria-labelledby');
    else input.setAttribute('aria-labelledby', ariaLabelledBy);
  });
}

interface AutocompleteFieldProps {
  chrome: 'search' | 'bare';
  ref: RefObject<HTMLInputElement | null>;
  id?: string;
  'aria-label'?: string;
  'aria-labelledby'?: string;
  value: string;
  onValueChange: (value: string) => void;
  onFocus: () => void;
  placeholder: string;
  disabled: boolean;
}

/**
 * The field itself, in one of the two chromes.
 *
 * `'bare'` composes the kit's own `TextInput` container and input variants
 * around `CommandBareInput` — the same two `cva` definitions `TextInput`
 * renders — rather than restating a border and a height here. That is what
 * makes "matches the TextInput next to it" a property of the code instead of
 * something that has to be checked by eye each time either one changes.
 */
function AutocompleteField({ chrome, ...props }: AutocompleteFieldProps) {
  if (chrome === 'search') return <CommandInput {...props} className="h-10" />;
  return (
    <div className={containerVariants({})}>
      <CommandBareInput {...props} className={inputVariants({})} />
    </div>
  );
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
  emptyMessage,
  chrome = 'search',
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
  useCallerNaming(inputRef, id, ariaLabelledBy);
  const { t } = useTranslation('ui');
  // `null` means "say nothing"; omitted means "say the kit's own line". They
  // are different answers, so the default cannot be a default parameter.
  const emptyText = emptyMessage === undefined ? t('autocomplete.empty') : emptyMessage;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Command className={cn('overflow-visible bg-transparent', className)}>
        <PopoverTrigger asChild>
          <AutocompleteField
            chrome={chrome}
            ref={inputRef}
            id={id}
            aria-label={ariaLabel}
            aria-labelledby={ariaLabelledBy}
            value={inputValue}
            onValueChange={handleInputChange}
            onFocus={() => inputValue && setOpen(true)}
            placeholder={placeholder}
            disabled={disabled}
          />
        </PopoverTrigger>
        <PopoverContent
          className="w-[var(--radix-popover-trigger-width)] p-0"
          side="bottom"
          align="start"
          onOpenAutoFocus={(e: Event) => e.preventDefault()}
        >
          <CommandList>
            {!loading && emptyText !== null && <CommandEmpty>{emptyText}</CommandEmpty>}
            <SuggestionItems suggestions={suggestions} onPick={handleSelect} />
          </CommandList>
        </PopoverContent>
      </Command>
    </Popover>
  );
}
