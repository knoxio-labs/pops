import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import { StayTimeline } from './StayTimeline';
import { sourceStay } from './test-utils';

afterEach(cleanup);
it('delegates known checkout-exclusive counts to the host formatter for selected and neighbouring stays', () => {
  const stay = sourceStay({ timing: { arrival: '2029-04-10', departure: '2029-04-11' } });
  const neighbour = sourceStay({
    id: 14,
    timing: { arrival: '2029-04-11', departure: '2029-04-13' },
  });
  const formatNights = vi.fn((count: number) => `host-count:${count}`);
  render(
    <StayTimeline stay={stay} stays={[stay, neighbour]} formatNights={formatNights}>
      Editor
    </StayTimeline>
  );
  expect(screen.getByText('host-count:1')).toBeVisible();
  expect(screen.getByText('host-count:2')).toBeVisible();
  expect(formatNights.mock.calls).toEqual([[1], [2]]);
});
it.each([
  {},
  { arrival: '2029-04-10' },
  { arrival: '2029-04-10', departure: '2029-04-10' },
  { arrival: '2029-04-11', departure: '2029-04-10' },
])('does not invent a night count for incomplete or nonpositive timing %j', (timing) => {
  const formatNights = vi.fn((count: number) => `host-count:${count}`);
  const stay = sourceStay({ timing });
  render(
    <StayTimeline stay={stay} stays={[stay]} formatNights={formatNights}>
      Editor
    </StayTimeline>
  );
  expect(formatNights).not.toHaveBeenCalled();
  expect(screen.queryByText(/host-count/)).not.toBeInTheDocument();
});
