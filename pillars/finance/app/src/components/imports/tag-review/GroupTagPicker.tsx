/**
 * The vocabulary picker inside `GroupTagBar` — a combobox input, a
 * facet-grouped dropdown, and the keyboard handling that keeps the two in
 * agreement.
 *
 * Built on cmdk `Command` + Radix `Popover`, the same primitives every
 * sibling finance picker composes (`RulePicker`, `ComboboxSelect`, the kit's
 * own `ChipInput`) — so arrow-key navigation, `role="listbox"`/`"option"`
 * semantics, and outside-click dismissal come from the kit rather than being
 * hand-rolled here. `ChipInput` itself doesn't fit this picker's shape: its
 * `suggestions` are a static label/value list filtered by substring match,
 * with no way for a caller to see the live typed text and answer "what would
 * this create" — the facet-aware creation flow (a typed value can offer
 * several simultaneous "create as <facet>" choices, or explain why an axis
 * refuses one) needs that live text, and needs more than one item to name
 * what pressing Enter/Tab does. Composing Command+Popover directly keeps
 * that logic while still getting the kit's combobox semantics for free.
 */
import { useState } from 'react';

import {
  Command,
  CommandBareInput,
  CommandList,
  Popover,
  PopoverAnchor,
  PopoverContent,
} from '@pops/ui';

import { type TagCreationIntent } from '../../../lib/tags';
import { PickerCreation, PickerOptions } from './GroupTagPicker.dropdown';

export interface PickerInputProps {
  inputValue: string;
  /** Matches shown in the dropdown: capped, then ordered by facet. */
  filtered: string[];
  /**
   * The vocabulary tag the typed text names, resolved against the whole
   * vocabulary rather than the visible matches — neither the display cap nor
   * the value-only labelling may turn Enter on an existing tag into the
   * creation of a near-duplicate.
   */
  exactMatch: string | undefined;
  /** What the typed text would create, when it names no existing tag. */
  creation: TagCreationIntent;
  showPicker: boolean;
  onAddTag: (tag: string) => void;
  setInputValue: (v: string) => void;
  setShowPicker: (v: boolean) => void;
}

interface KeyDownDeps {
  filtered: string[];
  exactMatch: string | undefined;
  creation: TagCreationIntent;
  hasNavigated: boolean;
  setHasNavigated: (v: boolean) => void;
  setInputValue: (v: string) => void;
  setShowPicker: (v: boolean) => void;
  onPick: (tag: string) => void;
}

/**
 * Enter picks whatever the user has arrow-navigated to (cmdk's default
 * behaviour, left alone by returning without calling `preventDefault`).
 * Without a navigation, Enter instead resolves directly against
 * `exactMatch`/a `ready` creation — the display cap can rank an exact match
 * out of the visible list entirely, and a typed label must still reuse the
 * stored tag it names rather than mint a near-duplicate. That shortcut only
 * makes sense before the user has picked a different option with the arrow
 * keys, so a navigation turns it off until the next keystroke edits the
 * query.
 */
function handlePickerKeyDown(e: React.KeyboardEvent<HTMLInputElement>, deps: KeyDownDeps) {
  const {
    filtered,
    exactMatch,
    creation,
    hasNavigated,
    setHasNavigated,
    setInputValue,
    setShowPicker,
    onPick,
  } = deps;
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    setHasNavigated(true);
    return;
  }
  if (e.key === 'Tab' && filtered.length > 0) {
    e.preventDefault();
    const first = filtered[0];
    if (first) onPick(first);
    return;
  }
  if (e.key === 'Enter' && !hasNavigated) {
    e.preventDefault();
    const resolved = exactMatch ?? (creation.kind === 'ready' ? creation.tag : undefined);
    if (resolved === undefined) return;
    onPick(resolved);
    return;
  }
  if (e.key === 'Escape') {
    e.preventDefault();
    setShowPicker(false);
    setInputValue('');
    setHasNavigated(false);
  }
}

interface PickerDropdownProps {
  inputValue: string;
  open: boolean;
  filtered: string[];
  creation: TagCreationIntent;
  onOpenChange: (open: boolean) => void;
  onValueChange: (next: string) => void;
  onFocus: () => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onPick: (tag: string) => void;
}

/** The combobox's rendered shell — split out so `PickerInput` stays under the repo's function-length limit. */
function PickerDropdown({
  inputValue,
  open,
  filtered,
  creation,
  onOpenChange,
  onValueChange,
  onFocus,
  onKeyDown,
  onPick,
}: PickerDropdownProps) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <Command shouldFilter={false} className="contents">
        <PopoverAnchor asChild>
          <CommandBareInput
            value={inputValue}
            onValueChange={onValueChange}
            onFocus={onFocus}
            onKeyDown={onKeyDown}
            placeholder="+ Add tag…"
            className="w-24 rounded-full border border-dashed border-border bg-background px-2 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </PopoverAnchor>
        <PopoverContent
          align="start"
          sideOffset={4}
          className="w-auto min-w-32 max-h-40 overflow-y-auto p-1"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <CommandList>
            {filtered.length > 0 && <PickerOptions filtered={filtered} onPick={onPick} />}
            <PickerCreation creation={creation} onPick={onPick} />
          </CommandList>
        </PopoverContent>
      </Command>
    </Popover>
  );
}

export function PickerInput(props: PickerInputProps) {
  const {
    inputValue,
    setInputValue,
    setShowPicker,
    showPicker,
    filtered,
    exactMatch,
    creation,
    onAddTag,
  } = props;
  const [hasNavigated, setHasNavigated] = useState(false);

  const onPick = (tag: string) => {
    onAddTag(tag);
    setShowPicker(false);
    setInputValue('');
    setHasNavigated(false);
  };

  const hasContent = filtered.length > 0 || creation.kind !== 'none';

  return (
    <PickerDropdown
      inputValue={inputValue}
      open={showPicker && hasContent}
      filtered={filtered}
      creation={creation}
      onOpenChange={(open) => {
        setShowPicker(open);
        if (!open) setInputValue('');
      }}
      onValueChange={(next) => {
        setInputValue(next);
        setShowPicker(true);
        setHasNavigated(false);
      }}
      onFocus={() => setShowPicker(true)}
      onKeyDown={(e) =>
        handlePickerKeyDown(e, {
          filtered,
          exactMatch,
          creation,
          hasNavigated,
          setHasNavigated,
          setInputValue,
          setShowPicker,
          onPick,
        })
      }
      onPick={onPick}
    />
  );
}
