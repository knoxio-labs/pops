import { Avatar, AvatarFallback, AvatarImage, initials } from '@pops/ui';

import { entityAvatarUrlFor, entityColourStyle } from './entity-colour';

import type { Entity } from './types';

export type AvatarEntity = Pick<Entity, 'id' | 'name' | 'avatarAssetId' | 'colour'>;

/**
 * The small mark used wherever an entity is named in passing — the list row,
 * a picker, a badge. Mirrors `pillars/design/src/kit/entity-header.tsx`'s
 * `EntityAvatar` fallback chain: the uploaded avatar image, or initials on
 * the assigned colour, or plain initials when even that is unset (a legacy
 * entity created before POPS-3061).
 */
export function EntityAvatar({
  entity,
  size = 'sm',
}: {
  entity: AvatarEntity;
  size?: 'sm' | 'default';
}) {
  const colour = entityColourStyle(entity.colour);
  return (
    <Avatar size={size}>
      {entity.avatarAssetId && (
        <AvatarImage src={entityAvatarUrlFor(entity.id, entity.avatarAssetId)} alt="" />
      )}
      <AvatarFallback
        style={colour ? { backgroundColor: colour.tint, color: colour.swatch } : undefined}
      >
        {initials(entity.name)}
      </AvatarFallback>
    </Avatar>
  );
}
