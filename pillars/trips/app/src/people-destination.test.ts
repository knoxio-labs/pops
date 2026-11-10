import { expect, it } from 'vitest';

import { bundles, routes } from './routes';

it('does not publish People as a separate Trip destination', () => {
  expect(routes.some((route) => route.path === ':tripId/people')).toBe(false);
  expect(Object.keys(bundles)).not.toContain('trips-people');
});
