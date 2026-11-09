import { initials } from '@/fixtures/entities';
import { UserRound } from 'lucide-react';

import { Avatar, AvatarFallback } from '@pops/ui';

/** Shows source-name initials only for a resolved contact; missing references use a neutral person glyph. */
export function TripPersonAvatar({
  name,
  available,
  large = false,
}: {
  name: string;
  available: boolean;
  large?: boolean;
}) {
  return (
    <Avatar className={large ? 'size-12 shrink-0' : 'size-10 shrink-0'}>
      <AvatarFallback className="bg-app-accent/15 text-sm text-app-accent">
        {available ? initials(name) : <UserRound className="size-5" aria-hidden />}
      </AvatarFallback>
    </Avatar>
  );
}
