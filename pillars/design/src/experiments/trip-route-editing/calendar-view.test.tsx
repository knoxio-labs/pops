import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { CalendarView } from './calendar-view';

import type { CalendarBooking } from './calendar-model';

describe('calendar date-only display', () => {
  it('shows floating calendar dates without suggesting midnight or a time zone', () => {
    const booking: CalendarBooking = {
      id: 'stay',
      recordId: 'hotel',
      title: 'Hotel',
      kind: 'stay',
      location: 'Olinda',
      startAt: '2027-12-29T00:00:00Z',
      endAt: '2028-01-03T00:00:00Z',
      timeZone: 'UTC',
      allDay: true,
      purchased: true,
    };
    const { container } = render(
      <CalendarView
        bookings={[booking]}
        findings={[]}
        from="2027-12-29"
        to="2028-01-03"
        scale="hours"
      />
    );
    expect(screen.getAllByText('All day')).toHaveLength(2);
    expect(container.textContent).toContain('2027-12-29');
    expect(container.textContent).toContain('2028-01-03');
    expect(container.textContent).not.toContain('00:00');
    expect(container.textContent).not.toContain('UTC');
    expect(container.querySelector('time[datetime]')).toBeNull();
  });
});

describe('calendar source labels', () => {
  it('shows source titles and findings without exposing implementation record identifiers', () => {
    const booking: CalendarBooking = {
      id: 'internal-booking-key',
      recordId: 'internal-record-key',
      title: 'SYD → DFW',
      kind: 'flight',
      location: 'Sydney → Dallas',
      startAt: '2027-11-24T10:00:00+11:00',
      endAt: '2027-11-24T08:15:00-06:00',
      timeZone: 'Australia/Sydney',
      endTimeZone: 'America/Chicago',
      purchased: true,
    };
    const { container } = render(
      <CalendarView
        bookings={[booking]}
        findings={[
          {
            id: 'short-gap',
            recordIds: [booking.recordId],
            message: '45 min available · 90 min configured',
          },
        ]}
        from="2027-11-24"
        to="2027-11-24"
        scale="days"
      />
    );
    expect(screen.getAllByText('SYD → DFW')).toHaveLength(2);
    expect(container.textContent).not.toContain('internal-record-key');
    expect(container.textContent).not.toContain('internal-booking-key');
    expect(container.querySelector('article')?.className).toContain('border-destructive');
    expect(container.querySelector('.lg\\:grid-cols-2')).toBeNull();
  });
});
