import { House, Inbox, MapPin, Sofa, SquareDashed } from 'lucide-react';

import type { LucideIcon } from 'lucide-react';

import type { LocationKind } from '../model/model.js';

/** The stable icon used for each semantic kind of inventory place. */
export const PLACE_ICONS: Readonly<Record<LocationKind, LucideIcon>> = {
  property: House,
  room: MapPin,
  furniture: Sofa,
  storage: Inbox,
  area: SquareDashed,
};
