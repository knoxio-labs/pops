import { navConfigFromWire } from '@pops/navigation';
import { TRIPS_NAV } from '@pops/trips/nav';

import type { IconName } from '@pops/navigation';

/** Browser projection of the sole published Trips navigation descriptor. */
export const navConfig = navConfigFromWire(TRIPS_NAV) satisfies {
  icon: IconName;
  items: { icon: IconName }[];
};
