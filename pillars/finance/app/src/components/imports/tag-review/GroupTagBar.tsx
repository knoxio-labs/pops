import { useEffect, useRef, useState } from 'react';

import { ButtonPrimitive } from '@pops/ui';

import { describeTag, groupTagsByFacet, orderTagsByFacet } from '../../../lib/tags';
import { cn } from '../../../lib/utils';
import { FacetHeading, TagChip } from '../../tags/TagChip';

/** How many vocabulary matches the picker dropdown offers at once. */
const PICKER_LIMIT = 10;

export interface GroupTagBarProps {
  stagedTags: string[];
  availableTags: string[];
  onAddTag: (tag: string) => void;
  onRemoveTag: (tag: string) => void;
  onApply: () => void;
}

function filterAvailableTags(input: string, available: string[], staged: string[]): string[] {
  if (input === '') {
    return available.filter((t) => !staged.includes(t));
  }
  const lower = input.toLowerCase();
  const startsWith: string[] = [];
  const contains: string[] = [];
  for (const t of available) {
    if (staged.includes(t)) continue;
    const tLower = t.toLowerCase();
    if (tLower.startsWith(lower)) startsWith.push(t);
    else if (tLower.includes(lower)) contains.push(t);
  }
  return [...startsWith, ...contains];
}

function useClickOutside(
  ref: React.RefObject<HTMLElement | null>,
  enabled: boolean,
  onOutside: () => void
) {
  useEffect(() => {
    if (!enabled) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onOutside();
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [enabled, ref, onOutside]);
}

function StagedTagPill({ tag, onRemove }: { tag: string; onRemove: () => void }) {
  return <TagChip tag={tag} removable onRemove={onRemove} className="border" />;
}

interface PickerInputProps {
  inputValue: string;
  /** Matches shown in the dropdown: capped, then ordered by facet. */
  filtered: string[];
  /**
   * A vocabulary tag equal to the input ignoring case, searched across every
   * match rather than only the visible ones — the cap must not turn Enter on
   * an existing tag into the creation of a near-duplicate.
   */
  exactMatch: string | undefined;
  showPicker: boolean;
  onAddTag: (tag: string) => void;
  setInputValue: (v: string) => void;
  setShowPicker: (v: boolean) => void;
}

function handlePickerKeyDown(e: React.KeyboardEvent, props: PickerInputProps): void {
  const { inputValue, filtered, exactMatch, onAddTag, setInputValue, setShowPicker } = props;
  if (e.key === 'Tab' && filtered.length > 0) {
    e.preventDefault();
    const first = filtered[0];
    if (first) onAddTag(first);
    setShowPicker(false);
    setInputValue('');
    return;
  }
  if (e.key === 'Enter') {
    e.preventDefault();
    if (exactMatch) {
      onAddTag(exactMatch);
    } else if (inputValue.trim()) {
      onAddTag(inputValue.trim());
      setInputValue('');
    }
    setShowPicker(false);
    setInputValue('');
    return;
  }
  if (e.key === 'Escape') {
    setShowPicker(false);
    setInputValue('');
  }
}

function PickerOption({ tag, onPick }: { tag: string; onPick: (tag: string) => void }) {
  const { label, ariaLabel, title } = describeTag(tag);
  return (
    <button
      className="w-full min-h-11 text-left px-3 py-1 text-xs hover:bg-accent transition-colors"
      title={title}
      aria-label={ariaLabel}
      data-tag={tag}
      onMouseDown={(e) => {
        e.preventDefault();
        onPick(tag);
      }}
    >
      {label}
    </button>
  );
}

function PickerDropdown({
  filtered,
  onPick,
}: {
  filtered: string[];
  onPick: (tag: string) => void;
}) {
  return (
    <div className="absolute top-full left-0 mt-1 z-10 bg-popover border rounded-md shadow-md py-1 min-w-32 max-h-40 overflow-y-auto">
      {groupTagsByFacet(filtered).map((group) => (
        <div key={group.label} role="group" aria-label={group.label}>
          <FacetHeading className="text-2xs uppercase tracking-wider text-muted-foreground font-semibold px-3 pt-1.5 pb-0.5">
            {group.label}
          </FacetHeading>
          {group.tags.map((parsed) => (
            <PickerOption key={parsed.raw} tag={parsed.raw} onPick={onPick} />
          ))}
        </div>
      ))}
    </div>
  );
}

function PickerInput(
  props: PickerInputProps & { containerRef: React.RefObject<HTMLDivElement | null> }
) {
  const { containerRef, inputValue, setInputValue, setShowPicker, showPicker, filtered, onAddTag } =
    props;
  const handlePick = (tag: string) => {
    onAddTag(tag);
    setShowPicker(false);
    setInputValue('');
  };
  return (
    <div ref={containerRef} className="relative">
      <input
        value={inputValue}
        onChange={(e) => {
          setInputValue(e.target.value);
          setShowPicker(true);
        }}
        onFocus={() => setShowPicker(true)}
        onKeyDown={(e) => handlePickerKeyDown(e, props)}
        placeholder="+ Add tag…"
        className="text-xs border border-dashed border-border rounded-full px-2 py-0.5 bg-background focus:outline-none focus:ring-1 focus:ring-ring w-24"
      />
      {showPicker && filtered.length > 0 && (
        <PickerDropdown filtered={filtered} onPick={handlePick} />
      )}
    </div>
  );
}

export function GroupTagBar({
  stagedTags,
  availableTags,
  onAddTag,
  onRemoveTag,
  onApply,
}: GroupTagBarProps) {
  const [inputValue, setInputValue] = useState('');
  const [showPicker, setShowPicker] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const ranked = filterAvailableTags(inputValue, availableTags, stagedTags);
  // Relevance picks the shortlist, then facet grouping fixes its order, so
  // what Tab completes is always what the dropdown shows first.
  const filtered = orderTagsByFacet(ranked.slice(0, PICKER_LIMIT)).map((parsed) => parsed.raw);
  const exactMatch = ranked.find((t) => t.toLowerCase() === inputValue.toLowerCase());

  useClickOutside(containerRef, showPicker, () => {
    setShowPicker(false);
    setInputValue('');
  });

  return (
    <div className="px-4 py-2 border-b bg-muted/10 flex flex-wrap items-center gap-2 text-xs">
      <span className="text-muted-foreground shrink-0">Apply to group:</span>
      {stagedTags.map((tag) => (
        <StagedTagPill key={tag} tag={tag} onRemove={() => onRemoveTag(tag)} />
      ))}
      <PickerInput
        containerRef={containerRef}
        inputValue={inputValue}
        setInputValue={setInputValue}
        showPicker={showPicker}
        setShowPicker={setShowPicker}
        filtered={filtered}
        exactMatch={exactMatch}
        onAddTag={onAddTag}
      />
      <ButtonPrimitive
        variant="outline"
        size="xs"
        onClick={onApply}
        disabled={stagedTags.length === 0}
        className={cn(
          'whitespace-nowrap',
          stagedTags.length > 0 && 'border-primary text-primary hover:bg-primary/10'
        )}
      >
        Merge into all
      </ButtonPrimitive>
    </div>
  );
}
