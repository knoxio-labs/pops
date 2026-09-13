import { useTranslation } from 'react-i18next';

import { Button, Popover, PopoverContent, PopoverTrigger } from '@pops/ui';

import { orderTagsByFacet } from '../../../lib/tags';
import { describeSourceMeta, SOURCE_ICONS, sourceTooltip } from '../../tag-editor/sourceMeta';
import { TagBadge } from '../../tags/TagChip';

import type { TagMetaEntry } from '../../tag-editor/utils';

const SHOWN = 3;

type TagSources = ReadonlyMap<string, readonly TagMetaEntry[]>;

function SourcedBadge({ tag, sources }: { tag: string; sources: readonly TagMetaEntry[] }) {
  const icons = [...new Set(sources.map((source) => SOURCE_ICONS[source.source]))].join('');
  const context = sources.flatMap((source) => sourceTooltip(source) ?? []).join('; ');
  return (
    <TagBadge
      tag={tag}
      className="text-xs"
      prefix={icons.length > 0 ? `${icons} ` : undefined}
      context={context.length > 0 ? context : undefined}
    />
  );
}

function HiddenTagSources({ tag, sources }: { tag: string; sources: readonly TagMetaEntry[] }) {
  const { t } = useTranslation('finance');
  return (
    <li className="space-y-1">
      <TagBadge tag={tag} className="text-xs" />
      {sources.length === 0 ? (
        <p className="text-xs text-muted-foreground">Added by hand</p>
      ) : (
        <ul className="space-y-0.5">
          {sources.map((source) => {
            const marker = describeSourceMeta(t, source);
            return (
              <li
                key={`${source.source}:${source.pattern ?? ''}`}
                className="text-xs text-muted-foreground"
              >
                <span aria-hidden="true">{marker.icon} </span>
                {marker.accessibleText}
              </li>
            );
          })}
        </ul>
      )}
    </li>
  );
}

/**
 * A group's current tags in the Tag Review header: the first few marked with
 * their sources, and the rest behind a `+N` listing each hidden tag with every
 * source that suggested it. However many tags a group carries, a tag that keeps
 * coming back can be traced to what applies it (POPS-252).
 */
export function GroupTagsPreview({ tags, sources }: { tags: string[]; sources: TagSources }) {
  if (tags.length === 0) return null;
  const ordered = orderTagsByFacet(tags);
  const hidden = ordered.slice(SHOWN);
  return (
    <div className="hidden sm:flex gap-1 flex-wrap items-center max-w-48">
      {ordered.slice(0, SHOWN).map((parsed) => (
        <SourcedBadge key={parsed.raw} tag={parsed.raw} sources={sources.get(parsed.raw) ?? []} />
      ))}
      {hidden.length > 0 && (
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="text-xs"
              aria-label={`${hidden.length} more tags and where they came from`}
            >
              +{hidden.length}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-72 p-3" align="end">
            <ul className="space-y-2">
              {hidden.map((parsed) => (
                <HiddenTagSources
                  key={parsed.raw}
                  tag={parsed.raw}
                  sources={sources.get(parsed.raw) ?? []}
                />
              ))}
            </ul>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
