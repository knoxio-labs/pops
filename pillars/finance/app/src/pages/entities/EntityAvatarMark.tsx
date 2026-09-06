import { Avatar, AvatarFallback, AvatarImage, initials } from '@pops/ui';

import { entityColourStyle } from './entity-colour';

/**
 * The small mark used wherever an entity is named in passing — the list row,
 * the edit dialog's preview. Same fallback chain as the design kit's
 * `EntityAvatar`: the uploaded avatar, or initials on the assigned colour, or
 * plain initials when even that is unset (a legacy entity predating
 * POPS-3061 can have `colour: null`).
 */
export function EntityAvatarMark({
  name,
  avatarUrl,
  colour,
  size = 'sm',
}: {
  name: string;
  avatarUrl: string | undefined;
  colour: string | null;
  size?: 'sm' | 'default';
}) {
  return (
    <Avatar size={size}>
      {avatarUrl && <AvatarImage src={avatarUrl} alt="" />}
      <AvatarFallback style={entityColourStyle(colour)}>{initials(name)}</AvatarFallback>
    </Avatar>
  );
}
