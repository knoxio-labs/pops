import { useState } from 'react';

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
  /** Tags currently applied across the group's transactions (the union). */
  currentTags: string[];
  availableTags: string[];
  /** The taxonomy a typed value may be created on. Empty offers no creation. */
  facets: TagFacetOption[];
  onAddTag: (tag: string) => void;
  onRemoveTag: (tag: string) => void;
  onApply: () => void;
  /** Strips one tag from every transaction in the group that carries it. */
  onRemoveCurrentTag: (tag: string) => void;
}

function StagedTagPill({ tag, onRemove }: { tag: string; onRemove: () => void }) {
  return <TagChip tag={tag} removable onRemove={onRemove} className="border" />;
}

/** The group's currently-applied tags, each removable from every transaction at once. */
function CurrentGroupTags({ tags, onRemove }: { tags: string[]; onRemove: (tag: string) => void }) {
  if (tags.length === 0) return null;
  return (
    <div className="w-full flex flex-wrap items-center gap-2">
      <span className="text-muted-foreground shrink-0">On group:</span>
      {tags.map((tag) => (
        <StagedTagPill key={tag} tag={tag} onRemove={() => onRemove(tag)} />
      ))}
    </div>
  );
}

export function GroupTagBar({
  stagedTags,
  currentTags,
  availableTags,
  facets,
  onAddTag,
  onRemoveTag,
  onApply,
  onRemoveCurrentTag,
}: GroupTagBarProps) {
  const [inputValue, setInputValue] = useState('');
  const [showPicker, setShowPicker] = useState(false);
  const ranked = rankTagSuggestions(inputValue, availableTags, stagedTags);
  // Relevance picks the shortlist, then facet grouping fixes its order, so
  // what Tab completes is always what the dropdown shows first.
  const filtered = orderTagsByFacet(ranked.slice(0, PICKER_LIMIT)).map((parsed) => parsed.raw);
  const exactMatch = resolveTypedTag(inputValue, availableTags);
  const creation =
    exactMatch === undefined ? planTagCreation(inputValue, facets) : ({ kind: 'none' } as const);

  return (
    <div className="px-4 py-2 border-b bg-muted/10 flex flex-wrap items-center gap-2 text-xs">
      <CurrentGroupTags tags={currentTags} onRemove={onRemoveCurrentTag} />
      <span className="text-muted-foreground shrink-0">Apply to group:</span>
      {stagedTags.map((tag) => (
        <StagedTagPill key={tag} tag={tag} onRemove={() => onRemoveTag(tag)} />
      ))}
      <PickerInput
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
