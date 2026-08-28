import { forwardRef } from 'react';

import { Badge, Button, type ButtonProps, Popover, PopoverContent, PopoverTrigger } from '@pops/ui';

import { orderTagsByFacet } from '../lib/tags';
import { cn } from '../lib/utils';
import { TagEditorPanel } from './tag-editor/TagEditorPanel';
import { type PanelHandlers, useTagEditorState } from './tag-editor/useTagEditorState';
import { type TagEditorProps, type TagMetaEntry, type TagSource } from './tag-editor/utils';
import { TagBadge } from './tags/TagChip';

export type { PanelHandlers, TagEditorProps, TagMetaEntry, TagSource };

const SOURCE_ICONS: Record<TagSource, string> = {
  ai: '🤖',
  rule: '📋',
  entity: '🏪',
};

interface TriggerProps extends Omit<ButtonProps, 'children'> {
  tags: string[];
  tagMeta?: Map<string, TagMetaEntry>;
}

function tooltipFor(meta: TagMetaEntry | undefined): string | undefined {
  if (meta?.source === 'rule' && meta?.pattern) return `Rule: "${meta.pattern}"`;
  if (meta?.source) return `${meta.source} suggestion`;
  return undefined;
}

/**
 * TriggerContent must forward refs and spread remaining props so that
 * Radix's `<PopoverTrigger asChild>` can inject its click/keyboard handlers,
 * ref, aria-haspopup, and aria-expanded onto the underlying Button. Without
 * this, clicking the tags cell would not open the popover.
 */
const TriggerContent = forwardRef<HTMLButtonElement, TriggerProps>(
  ({ tags, tagMeta, className, disabled, ...rest }, ref) => (
    <Button
      ref={ref}
      variant="ghost"
      className={cn(
        'flex flex-wrap gap-1 min-h-10 text-left w-full rounded px-2 py-1.5 transition-colors items-center h-auto',
        disabled ? 'cursor-default' : 'hover:bg-accent/50 cursor-pointer',
        className
      )}
      aria-label="Edit tags"
      disabled={disabled}
      {...rest}
    >
      {tags.length === 0 ? (
        <span className="text-muted-foreground text-xs">—</span>
      ) : (
        orderTagsByFacet(tags)
          .slice(0, 3)
          .map((parsed) => {
            const meta = tagMeta?.get(parsed.raw);
            return (
              <TagBadge
                key={parsed.raw}
                tag={parsed.raw}
                variant="outline"
                colored
                className="text-2xs uppercase tracking-wider font-bold py-0 px-1.5"
                context={tooltipFor(meta)}
                prefix={meta ? `${SOURCE_ICONS[meta.source]} ` : undefined}
              />
            );
          })
      )}
      {tags.length > 3 && (
        <Badge variant="secondary" className="text-2xs py-0 px-1.5 font-normal opacity-70">
          +{tags.length - 3}
        </Badge>
      )}
    </Button>
  )
);
TriggerContent.displayName = 'TagEditorTriggerContent';

/**
 * TagEditor — inline popover for editing transaction tags.
 */
export function TagEditor(props: TagEditorProps) {
  const { disabled = false, tagMeta } = props;
  const { open, setOpen, tags, handlers } = useTagEditorState(props);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <TriggerContent tags={tags} disabled={disabled} tagMeta={tagMeta} />
      </PopoverTrigger>
      <PopoverContent className="w-80 p-3" align="start">
        <TagEditorPanel {...handlers} />
      </PopoverContent>
    </Popover>
  );
}
