import { Pencil } from 'lucide-react';

import { Avatar, AvatarFallback, AvatarImage, Badge, Button, initials } from '@pops/ui';

import {
  entityAvatarUrlFor,
  entityColourStyle,
  entityPosterUrlFor,
} from '../entities/entity-colour';

import type { Entity } from '../../contacts-api/types.gen.js';

/**
 * The banner-forward profile header (POPS-3076), mirroring the design
 * playground's `EntityProfileHeader`
 * (`pillars/design/src/kit/entity-header.tsx`) and the layout decision
 * recorded in `pillars/design/src/experiments/entity-identity-layout` —
 * banner-forward beat the compact, accent-led alternative. A poster fills
 * the banner; without one it collapses to a flat tint of the entity's
 * colour (or a neutral tint, when even that is unset), so the avatar always
 * has somewhere to overlap.
 */
export function EntityDetailHeader({ entity, onEdit }: { entity: Entity; onEdit: () => void }) {
  const colour = entityColourStyle(entity.colour);
  const bannerStyle = entity.posterAssetId
    ? {
        backgroundImage: `url("${entityPosterUrlFor(entity.id, entity.posterAssetId)}")`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }
    : { backgroundColor: colour?.tint ?? 'var(--muted)' };

  return (
    <div className="relative overflow-hidden rounded-lg border">
      <div className="h-40 w-full sm:h-48" style={bannerStyle} />
      <Button
        size="sm"
        variant="outline"
        className="absolute top-3 right-3 bg-background/80 backdrop-blur"
        onClick={onEdit}
      >
        <Pencil className="h-3.5 w-3.5" /> Edit
      </Button>
      <div className="flex flex-col gap-4 px-6 pt-3 pb-4 sm:flex-row sm:items-end sm:gap-6">
        <Avatar
          className="-mt-16 size-32 border-4 border-background shadow-sm sm:-mt-24 sm:size-44"
          style={colour ? { boxShadow: `0 0 0 3px ${colour.ring}` } : undefined}
        >
          {entity.avatarAssetId && (
            <AvatarImage src={entityAvatarUrlFor(entity.id, entity.avatarAssetId)} alt="" />
          )}
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
            <Badge variant="outline" className="capitalize">
              {entity.type}
            </Badge>
          </div>
          {entity.aliases.length > 0 && (
            <p className="text-sm text-muted-foreground">
              also known as {entity.aliases.join(', ')}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
