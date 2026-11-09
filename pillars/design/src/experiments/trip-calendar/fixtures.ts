import { cityName, initialPerson } from '../contact-person-detail/model';
import { calendarBookings, calendarRules } from '../trip-route-editing/calendar-fixtures';
import { canvasCalendar } from '../trip-route-editing/canvas-calendar';
import { initialCanvas } from '../trip-route-editing/canvas-model';
import { applyFlightWindow, type CalendarScenario, type TripCalendarState } from './model';

/** Builds independent source-backed fictional booking clocks and inclusive contact availability dates. */
export function createTripCalendarState(scenario: CalendarScenario = 'default'): TripCalendarState {
  const marina = initialPerson('default');
  const state: TripCalendarState = {
    bookings: [
      ...structuredClone(calendarBookings),
      ...canvasCalendar(initialCanvas('default')).filter((booking) => booking.kind === 'rental'),
    ],
    rules: structuredClone(calendarRules),
    availability: marina.availability.map((availability) => ({
      id: availability.id,
      contactId: 'contact-marina',
      name: marina.name,
      city: cityName(availability.city),
      from: availability.start,
      to: availability.end,
      status: availability.status,
    })),
    from: '2027-12-28',
    to: '2028-01-03',
    timeZone: 'America/Recife',
    kind: 'all',
  };
  if (scenario === 'empty') return { ...state, bookings: [], availability: [], rules: [] };
  if (scenario === 'flight-window') return applyFlightWindow(state, 'flight').state;
  if (scenario === 'invalid-range') return { ...state, from: '2028-01-05', to: '2027-12-19' };
  if (scenario === 'missing-time')
    state.bookings = state.bookings.map((booking) =>
      booking.id === 'poa-rec' ? { ...booking, startAt: '2027-12-29' } : booking
    );
  if (scenario === 'date-line')
    return { ...state, from: '2028-02-25', to: '2028-02-28', timeZone: 'Australia/Sydney' };
  return state;
}
