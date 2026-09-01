import { useEffect, useRef, useState } from 'react';

import { ButtonPrimitive } from '@pops/ui';

import {
  orderTagsByFacet,
  planTagCreation,
  rankTagSuggestions,
  resolveTypedTag,
  type TagFacetOption,
} from '../../../lib/tags';
import { cn } from '../../../lib/utils';
import { TagChip } from '../../tags/TagChip';
import { PickerInput } from './GroupTagPicker';

/** How many vocabulary matches the picker dropdown offers at once. */
const PICKER_LIMIT = 10;

export interface GroupTagBarProps {
  stagedTags: string[];
  availableTags: string[];
  /** The taxonomy a typed value may be created on. Empty offers no creation. */
  facets: TagFacetOption[];
  onAddTag: (tag: string) => void;
  onRemoveTag: (tag: string) => void;
  onApply: () => void;
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

export function GroupTagBar({
  stagedTags,
  availableTags,
  facets,
  onAddTag,
  onRemoveTag,
  onApply,
}: GroupTagBarProps) {
  const [inputValue, setInputValue] = useState('');
  const [showPicker, setShowPicker] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const ranked = rankTagSuggestions(inputValue, availableTags, stagedTags);
  // Relevance picks the shortlist, then facet grouping fixes its order, so
  // what Tab completes is always what the dropdown shows first.
  const filtered = orderTagsByFacet(ranked.slice(0, PICKER_LIMIT)).map((parsed) => parsed.raw);
  const exactMatch = resolveTypedTag(inputValue, availableTags);
  const creation =
    exactMatch === undefined ? planTagCreation(inputValue, facets) : ({ kind: 'none' } as const);

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
        creation={creation}
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
