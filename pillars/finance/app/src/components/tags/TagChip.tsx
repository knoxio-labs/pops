/**
 * The tag renderers every finance surface shares.
 *
 * Both show a tag's value and convey its facet through colour, an accessible
 * name and a tooltip — never by printing the `facet:` prefix. Two variants
 * exist only because the surfaces they replaced were split between the
 * `Chip` and `Badge` primitives.
 */
import { Badge, Chip } from '@pops/ui';

import { describeTag, groupTagsByFacet } from '../../lib/tags';

import type { ComponentProps, ReactNode } from 'react';

interface TagPresentationProps {
  /** The stored tag, `facet:value` or bare. */
  tag: string;
  /** Extra attribution shown ahead of the raw string in the tooltip. */
  context?: string;
  /** Rendered before the label, e.g. a source icon. */
  prefix?: ReactNode;
  className?: string;
}

export interface TagChipProps extends TagPresentationProps {
  size?: ComponentProps<typeof Chip>['size'];
  removable?: boolean;
  onRemove?: () => void;
}

export function TagChip({
  tag,
  context,
  prefix,
  className,
  size,
  removable,
  onRemove,
}: TagChipProps) {
  const { label, ariaLabel, title, style } = describeTag(tag, context);
  return (
    <Chip
      size={size}
      style={style}
      className={className}
      title={title}
      aria-label={ariaLabel}
      data-tag={tag}
      removable={removable}
      onRemove={onRemove}
      removeLabel={`Remove ${ariaLabel}`}
      prefix={prefix}
    >
      {label}
    </Chip>
  );
}

export interface TagBadgeProps extends TagPresentationProps {
  variant?: ComponentProps<typeof Badge>['variant'];
  /** Colour the badge by facet. Off for badges that sit in a muted row. */
  colored?: boolean;
}

export function TagBadge({
  tag,
  context,
  prefix,
  className,
  variant = 'secondary',
  colored = false,
}: TagBadgeProps) {
  const { label, ariaLabel, title, style } = describeTag(tag, context);
  return (
    <Badge
      variant={variant}
      className={className}
      style={colored ? style : undefined}
      title={title}
      aria-label={ariaLabel}
      data-tag={tag}
    >
      {prefix}
      {label}
    </Badge>
  );
}

/** Heading that names the axis above a grouped run of tags. */
export function FacetHeading({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p
      className={
        className ??
        'text-2xs uppercase tracking-wider text-muted-foreground font-semibold w-full mt-1 first:mt-0'
      }
    >
      {children}
    </p>
  );
}

/**
 * A read-only run of tag badges grouped by facet, with the overflow past
 * `limit` collapsed into a `+N` badge.
 */
export function TagBadgeRow({
  tags,
  limit,
  variant,
  colored,
  className = 'flex flex-wrap gap-1',
  badgeClassName,
}: {
  tags: string[];
  limit?: number;
  variant?: TagBadgeProps['variant'];
  colored?: boolean;
  className?: string;
  badgeClassName?: string;
}) {
  const groups = groupTagsByFacet(tags);
  const ordered = groups.flatMap((group) => group.tags);
  const shown = limit === undefined ? ordered : ordered.slice(0, limit);
  return (
    <div className={className}>
      {shown.map((parsed) => (
        <TagBadge
          key={parsed.raw}
          tag={parsed.raw}
          variant={variant}
          colored={colored}
          className={badgeClassName}
        />
      ))}
      {limit !== undefined && ordered.length > limit && (
        <Badge variant="secondary" className={badgeClassName}>
          +{ordered.length - limit}
        </Badge>
      )}
    </div>
  );
}
