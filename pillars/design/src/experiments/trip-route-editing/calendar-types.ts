/** A dated arrangement: offset-bearing instants and IANA zones remain distinct. */
export interface CalendarBooking {
  id: string;
  recordId: string;
  title: string;
  kind: 'flight' | 'event' | 'stay' | 'rental';
  location: string;
  startAt: string;
  endAt?: string;
  timeZone: string;
  endTimeZone?: string;
  purchased: boolean;
  /** UTC-midnight boundaries encode floating calendar dates, never appointment times. */
  allDay?: boolean;
}

/** An explicitly configured minimum between two booking identities, in minutes. */
export interface TimingRule {
  id: string;
  fromId: string;
  toId: string;
  minimumMinutes: number;
  kind: 'connection' | 'airport-transfer';
}

/** A validation failure referring to the owning route records. */
export interface TimingFinding {
  id: string;
  recordIds: string[];
  message: string;
  availableMinutes?: number;
  requiredMinutes?: number;
}

/** A boundary or single continuing interval in a selected local calendar range. */
export interface CalendarEntry {
  booking: CalendarBooking;
  day: string;
  at: string;
  zone: string;
  boundary: 'start' | 'end' | 'continuing';
}
