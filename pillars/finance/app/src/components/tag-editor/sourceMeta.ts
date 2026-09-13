import type { TFunction } from 'i18next';

import type { TagMetaEntry, TagSource } from './utils';

/** Icon shown ahead of a tag's source label — decorative, never the sole carrier of meaning. */
export const SOURCE_ICONS: Record<TagSource, string> = {
  ai: '🤖',
  rule: '📋',
  entity: '🏪',
};

/** The tooltip a tag badge carries for its source: a rule's pattern when there is one. */
export function sourceTooltip(meta: TagMetaEntry | undefined): string | undefined {
  if (meta?.source === 'rule' && meta.pattern) return `Rule: "${meta.pattern}"`;
  if (meta?.source) return `${meta.source} suggestion`;
  return undefined;
}

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
  // Carried in words as well as a percentage, so a hesitant suggestion does not
  // read as a confident one to anyone who cannot see a colour (POPS-3671).
  if (meta.preAccept === false) parts.push(t('tag.source.unconfirmed'));
  if (meta.confidence !== undefined) parts.push(`${Math.round(meta.confidence * 100)}%`);
  const visibleText = parts.join(' · ');

  const accessibleParts = [visibleText];
  if (meta.confidence !== undefined) {
    accessibleParts.push(
      t('tag.source.confidence', { percent: Math.round(meta.confidence * 100) })
    );
  }
  if (meta.source === 'rule' && meta.pattern) {
    accessibleParts.push(t('tag.source.rulePattern', { pattern: meta.pattern }));
  }

  return {
    icon: SOURCE_ICONS[meta.source],
    visibleText,
    accessibleText: accessibleParts.join(', '),
  };
}
