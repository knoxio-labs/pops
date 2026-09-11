import type { TFunction } from 'i18next';

import type { TagMetaEntry, TagSource } from './utils';

/** Icon shown ahead of a tag's source label — decorative, never the sole carrier of meaning. */
export const SOURCE_ICONS: Record<TagSource, string> = {
  ai: '🤖',
  rule: '📋',
  entity: '🏪',
};

export interface SourceMarkerText {
  icon: string;
  /** Short label shown alongside the tag, e.g. "AI · New". */
  visibleText: string;
  /** Fuller text for the marker's accessible name, e.g. "AI · New, Matched "IGA Coles"". */
  accessibleText: string;
}

/**
 * Describes a suggested tag's provenance for both sighted and assistive-tech
 * users — the marker must carry a real name, not just an emoji or colour.
 */
export function describeSourceMeta(t: TFunction<'finance'>, meta: TagMetaEntry): SourceMarkerText {
  const parts = [t(`tag.source.${meta.source}`)];
  if (meta.isNew) parts.push(t('tag.source.new'));
  const visibleText = parts.join(' · ');

  const accessibleParts = [visibleText];
  if (meta.source === 'rule' && meta.pattern) {
    accessibleParts.push(t('tag.source.rulePattern', { pattern: meta.pattern }));
  }

  return {
    icon: SOURCE_ICONS[meta.source],
    visibleText,
    accessibleText: accessibleParts.join(', '),
  };
}
