import { useTranslation } from 'react-i18next';

import { Button } from '@pops/ui';

import { describeTag } from '../../lib/tags';
import { FacetHeading } from '../tags/TagChip';
import { describeSourceMeta } from './sourceMeta';
import { type TagMetaEntry } from './utils';

import type { SuggestedTag } from '@pops/finance';

/**
 * One tag-suggester candidate — badged with its source (mirrors Tag Review's
 * provenance badges). Picking it stores only `suggestion.tag`; the rest of
 * the object never reaches `onSave`.
 */
function EngineSuggestionButton({
  suggestion,
  onAddTag,
}: {
  suggestion: SuggestedTag;
  onAddTag: (tag: string) => void;
}) {
  const { t } = useTranslation('finance');
  const { label, ariaLabel, title, style } = describeTag(suggestion.tag);
  const meta: TagMetaEntry = {
    source: suggestion.source,
    pattern: suggestion.pattern,
    isNew: suggestion.isNew,
  };
  const { icon, visibleText, accessibleText } = describeSourceMeta(t, meta);
  const tooltip =
    meta.source === 'rule' && meta.pattern
      ? t('tag.source.rulePattern', { pattern: meta.pattern })
      : title;
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => onAddTag(suggestion.tag)}
      className="rounded-full text-xs h-7 px-3 hover:brightness-110 gap-1"
      style={style}
      title={tooltip}
      aria-label={`${t('tag.suggestAdd', { label: ariaLabel })}, ${accessibleText}`}
      data-tag={suggestion.tag}
    >
      <span aria-hidden="true">{icon}</span>+ {label}
      <span className="text-2xs opacity-70 uppercase tracking-wide">{visibleText}</span>
    </Button>
  );
}

/** The tag-suggester's picks for this transaction, badged by source, still unapplied. */
export function EngineSuggestions({
  suggestedTags,
  onAddTag,
}: {
  suggestedTags: SuggestedTag[];
  onAddTag: (tag: string) => void;
}) {
  const { t } = useTranslation('finance');
  if (suggestedTags.length === 0) return null;
  return (
    <div className="space-y-1.5">
      <FacetHeading>{t('tag.suggestedTags')}</FacetHeading>
      <div className="flex flex-wrap gap-2">
        {suggestedTags.map((suggestion) => (
          <EngineSuggestionButton
            key={suggestion.tag}
            suggestion={suggestion}
            onAddTag={onAddTag}
          />
        ))}
      </div>
    </div>
  );
}
