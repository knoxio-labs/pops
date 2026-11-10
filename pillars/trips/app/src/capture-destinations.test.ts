import { expect, it } from 'vitest';

import { TRIPS_PAGES } from '@pops/trips/pages';

import { bundles, routes } from './routes';

it.each(['capture', 'inbox', 'explore'])(
  'keeps %s contextual rather than publishing another Trip destination',
  (name) => {
    expect(TRIPS_PAGES.some((page) => page.path === `:tripId/${name}`)).toBe(false);
    expect(Object.keys(bundles)).not.toContain(`trips-${name}`);
    expect(routes.some((route) => route.path === `:tripId/${name}`)).toBe(false);
  }
);
