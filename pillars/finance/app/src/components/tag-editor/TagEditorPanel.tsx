import { useTranslation } from 'react-i18next';

import { Button, TextInput } from '@pops/ui';

import {
  describeTag,
  groupTagsByFacet,
  orderTagsByFacet,
  type TagCreationIntent,
} from '../../lib/tags';
import { FacetHeading, TagChip } from '../tags/TagChip';
import { TagCreationRow } from '../tags/TagCreationRow';
import { describeSourceMeta, type SourceMarkerText } from './sourceMeta';
import { type TagMetaEntry } from './utils';

interface PanelProps {
  tags: string[];
  inputValue: string;
  filtered: string[];
  tagMeta: Map<string, TagMetaEntry>;
  creation: TagCreationIntent;
  isSaving: boolean;
  isSuggesting: boolean;
  inputRef: React.RefObject<HTMLInputElement | null>;
  setInputValue: (v: string) => void;
  onSave: () => void;
  onSuggest?: () => void;
  onCancel: () => void;
  onAddTag: (tag: string) => void;
  onRemoveTag: (tag: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
}

/**
 * The source marker riding alongside a chip whose tag came from `onSuggest`.
 * Secondary to the chip's own hash colour — it never replaces it, only adds
 * the rule/AI/entity provenance next to it.
 */
function ProvenanceBadge({ icon, visibleText, accessibleText }: SourceMarkerText) {
  return (
    <span
      className="inline-flex items-center gap-0.5 text-2xs uppercase tracking-wide text-muted-foreground"
      title={accessibleText}
    >
      <span aria-hidden="true">{icon}</span>
      {visibleText}
    </span>
  );
}

function CurrentTags({
  tags,
  tagMeta,
  onRemove,
}: {
  tags: string[];
  tagMeta: Map<string, TagMetaEntry>;
  onRemove: (tag: string) => void;
}) {
  const { t } = useTranslation('finance');
  if (tags.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {orderTagsByFacet(tags).map((parsed) => {
        const meta = tagMeta.get(parsed.raw);
        const marker = meta ? describeSourceMeta(t, meta) : undefined;
        return (
          <div key={parsed.raw} className="inline-flex items-center gap-1">
            <TagChip
              tag={parsed.raw}
              removable
              onRemove={() => onRemove(parsed.raw)}
              className="border"
              context={marker?.accessibleText}
            />
            {marker && <ProvenanceBadge {...marker} />}
          </div>
        );
      })}
    </div>
  );
}

function SuggestionButton({ tag, onAddTag }: { tag: string; onAddTag: (tag: string) => void }) {
  const { label, ariaLabel, title, style } = describeTag(tag);
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => onAddTag(tag)}
      className="rounded-full text-xs h-7 px-3 hover:brightness-110"
      style={style}
      title={title}
      aria-label={`Add ${ariaLabel}`}
      data-tag={tag}
    >
      + {label}
    </Button>
  );
}

function Suggestions({
  filtered,
  onAddTag,
}: {
  filtered: string[];
  onAddTag: (tag: string) => void;
}) {
  if (filtered.length === 0) return null;
  return (
    <div className="space-y-1.5">
      {groupTagsByFacet(filtered).map((group) => (
        <div key={group.label} className="space-y-1">
          <FacetHeading>{group.label}</FacetHeading>
          <div className="flex flex-wrap gap-2">
            {group.tags.map((parsed) => (
              <SuggestionButton key={parsed.raw} tag={parsed.raw} onAddTag={onAddTag} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function PanelActions({
  isSaving,
  isSuggesting,
  onSave,
  onSuggest,
  onCancel,
}: {
  isSaving: boolean;
  isSuggesting: boolean;
  onSave: () => void;
  onSuggest?: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="flex items-center justify-between pt-1">
      {onSuggest ? (
        <Button
          variant="link"
          size="sm"
          onClick={onSuggest}
          disabled={isSuggesting}
          className="text-xs text-muted-foreground hover:text-foreground px-0 h-auto"
        >
          {isSuggesting ? 'Suggesting…' : 'Suggest'}
        </Button>
      ) : (
        <span />
      )}
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={onCancel} className="text-xs px-3 h-auto py-2">
          Cancel
        </Button>
        <Button size="sm" onClick={onSave} disabled={isSaving} className="text-xs px-3 h-auto py-2">
          {isSaving ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </div>
  );
}

export function TagEditorPanel({
  tags,
  inputValue,
  filtered,
  tagMeta,
  creation,
  isSaving,
  isSuggesting,
  inputRef,
  setInputValue,
  onSave,
  onSuggest,
  onCancel,
  onAddTag,
  onRemoveTag,
  onKeyDown,
}: PanelProps) {
  return (
    <div className="space-y-3">
      <p className="text-sm font-medium">Edit tags</p>
      <CurrentTags tags={tags} tagMeta={tagMeta} onRemove={onRemoveTag} />
      <TextInput
        ref={inputRef}
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder="Type to add a tag…"
        aria-label="Add a tag"
        autoFocus
      />
      <TagCreationRow creation={creation} onAddTag={onAddTag} />
      <Suggestions filtered={filtered} onAddTag={onAddTag} />
      <PanelActions
        isSaving={isSaving}
        isSuggesting={isSuggesting}
        onSave={onSave}
        onSuggest={onSuggest}
        onCancel={onCancel}
      />
    </div>
  );
}
