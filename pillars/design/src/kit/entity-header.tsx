import { entityColour, ENTITY_TYPE_LABEL, initials, type Entity } from '@/fixtures/entities';
import { type ReactNode } from 'react';

import { Avatar, AvatarFallback, AvatarImage, Badge, cn } from '@pops/ui';

/**
 * The small mark used wherever an entity is named in passing (the list row,
 * a picker, a badge) rather than given a page. Same fallback rule as the
 * headers: the uploaded avatar, or initials on the assigned colour, or plain
 * initials when even that is unset.
 */
export function EntityAvatar({ entity, size = 'sm' }: { entity: Entity; size?: 'sm' | 'default' }) {
  const colour = entityColour(entity);
  return (
    <Avatar size={size}>
      {entity.avatar && <AvatarImage src={entity.avatar} alt="" />}
      <AvatarFallback
        style={colour ? { backgroundColor: colour.tint, color: colour.swatch } : undefined}
      >
        {initials(entity.name)}
      </AvatarFallback>
    </Avatar>
  );
}

/**
 * The banner-forward header: a poster fills the top of the page and the
 * avatar sits half over it, half over the body: the layout only reads as a
 * "profile" while both are present. When there is no poster the banner
 * collapses to a flat tint of the entity's colour (or a neutral one, when
 * even that is unset), so the header still has somewhere to put the avatar
 * without pretending an image exists.
 */
export function EntityProfileHeader({ entity }: { entity: Entity }) {
  const colour = entityColour(entity);
  const bannerStyle = entity.poster
    ? {
        backgroundImage: `url("${entity.poster}")`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }
    : { backgroundColor: colour?.tint ?? 'var(--muted)' };

  return (
    <div>
      <div className="h-40 w-full rounded-t-lg sm:h-48" style={bannerStyle} />
      <div className="flex flex-col gap-4 px-6 pt-3 pb-2 sm:flex-row sm:items-end sm:gap-6">
        <Avatar
          className="-mt-16 size-32 border-4 border-background shadow-sm sm:-mt-24 sm:size-44"
          style={colour ? { boxShadow: `0 0 0 3px ${colour.ring}` } : undefined}
        >
          {entity.avatar && <AvatarImage src={entity.avatar} alt="" />}
          <AvatarFallback
            className="text-3xl font-medium sm:text-5xl"
            style={colour ? { backgroundColor: colour.tint, color: colour.swatch } : undefined}
          >
            {initials(entity.name)}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 space-y-1 pb-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold">{entity.name}</h1>
            <Badge variant="outline">{ENTITY_TYPE_LABEL[entity.type]}</Badge>
          </div>
          {entity.aliases && entity.aliases.length > 0 && (
            <p className="text-sm text-muted-foreground">
              also known as {entity.aliases.join(', ')}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * The compact, accent-led header: one row, no reserved poster space. The
 * colour carries identity on its own here (a ring around the avatar and a
 * left border on the row) since there is nowhere for a banner to go. A
 * poster, when the entity has one, demotes to a small thumbnail rather than
 * disappearing: the field is still shown, just not given the page's width.
 */
export function EntityCompactHeader({ entity }: { entity: Entity }) {
  const colour = entityColour(entity);
  return (
    <div
      className="flex items-center gap-4 border-l-4 py-1 pl-4"
      style={{ borderColor: colour?.swatch ?? 'transparent' }}
    >
      <Avatar
        className="size-14 shrink-0"
        style={colour ? { boxShadow: `0 0 0 2px ${colour.ring}` } : undefined}
      >
        {entity.avatar && <AvatarImage src={entity.avatar} alt="" />}
        <AvatarFallback
          className="text-base font-medium"
          style={colour ? { backgroundColor: colour.tint, color: colour.swatch } : undefined}
        >
          {initials(entity.name)}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold">{entity.name}</h1>
          <Badge variant="outline">{ENTITY_TYPE_LABEL[entity.type]}</Badge>
        </div>
        {entity.aliases && entity.aliases.length > 0 && (
          <p className="truncate text-sm text-muted-foreground">
            also known as {entity.aliases.join(', ')}
          </p>
        )}
      </div>
      {entity.poster && (
        <img
          src={entity.poster}
          alt=""
          className="hidden h-14 w-24 shrink-0 rounded-md object-cover sm:block"
        />
      )}
    </div>
  );
}

export function DefinitionRow({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('grid grid-cols-[140px_1fr] gap-4 py-2.5 text-sm', className)}>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}
