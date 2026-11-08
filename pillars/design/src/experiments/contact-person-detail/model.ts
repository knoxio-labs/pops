/** Editable fictional contact point; kind is selected explicitly, never inferred from text. */
export interface ContactPoint {
  id: string;
  kind: string;
  label: string;
  value: string;
}
/** A local address with an explicit user-defined label. */
export interface Address {
  id: string;
  label: string;
  city: string;
  address: string;
}
/** Availability is a bounded statement only when both calendar dates are present. */
export interface Availability {
  id: string;
  city: string;
  start: string;
  end: string;
  status: string;
}
/** A plan references a local visit and retains free-text intent. */
export interface Plan {
  id: string;
  title: string;
  visit: string;
  notes: string;
}
/** Every editable fact participates in the same local undo history. */
export interface Person {
  name: string;
  notes: string;
  methods: ContactPoint[];
  addresses: Address[];
  availability: Availability[];
  plans: Plan[];
}
/** Named review fixtures. */
export type Scenario = 'default' | 'new' | 'conflicting' | 'missing-reference';
/** Fictional city choices do not constrain address free text. */
export const cities = [
  { id: 'porto-alegre', name: 'Porto Alegre' },
  { id: 'recife-olinda', name: 'Olinda' },
];
/** Existing trip visits used by reference selectors and overlap calculations. */
export const visits = [
  { id: 'family', city: 'porto-alegre', start: '2027-12-20', end: '2027-12-29' },
  { id: 'olinda', city: 'recife-olinda', start: '', end: '' },
];
/** Resolve an explicit city reference without exposing its identifier. */
export function cityName(id: string): string {
  return cities.find((city) => city.id === id)?.name ?? 'City unavailable';
}
/** Derive visit labels from source city and exact dates, omitting unset values. */
export function visitLabel(visit: (typeof visits)[number]): string {
  return [
    cityName(visit.city),
    visit.start &&
      new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(
        new Date(visit.start)
      ),
    visit.end &&
      new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(
        new Date(visit.end)
      ),
  ]
    .filter(Boolean)
    .join(' · ');
}
/** Build an independent editable snapshot for each named state. */
export function initialPerson(scenario: Scenario): Person {
  if (scenario === 'new')
    return { name: '', notes: '', methods: [], addresses: [], availability: [], plans: [] };
  return {
    name: 'Marina Duarte',
    notes: 'Met through Clara. Ask about a walk along the Guaíba.',
    methods: [
      { id: 'm1', kind: 'Email', label: 'Personal', value: 'marina@example.test' },
      { id: 'm2', kind: 'Email', label: 'Studio', value: 'marina@studio.example.test' },
      { id: 'm3', kind: 'Phone', label: 'Mobile', value: '+55 51 5550 0182' },
      { id: 'm4', kind: 'Social', label: 'Signal', value: '@marina.b' },
    ],
    addresses: [
      { id: 'a1', label: 'Home', city: 'Porto Alegre', address: 'Rua das Flores, 18' },
      { id: 'a2', label: 'Studio', city: 'Olinda', address: 'Rua do Sol, 24' },
    ],
    availability: [
      {
        id: 'v1',
        city: 'porto-alegre',
        start: '2027-12-19',
        end: '2027-12-28',
        status: 'Available',
      },
      ...(scenario === 'conflicting'
        ? [
            {
              id: 'v2',
              city: 'porto-alegre',
              start: '2027-12-23',
              end: '2027-12-26',
              status: 'Unavailable',
            },
          ]
        : []),
    ],
    plans: [
      {
        id: 'p1',
        title: 'Dinner and a Guaíba walk',
        visit: scenario === 'missing-reference' ? 'removed' : 'family',
        notes: 'Ask which evening works.',
      },
    ],
  };
}
/** Resolve references without displaying opaque identifiers. */
export function visitName(id: string): string {
  const visit = visits.find((item) => item.id === id);
  if (visit) return visitLabel(visit);
  return id ? 'Visit unavailable' : 'Choose visit';
}
/** Only exact, valid, bounded calendar dates can establish an inclusive overlap. */
export function overlap(
  a: { city: string; start: string; end: string },
  b: { city: string; start: string; end: string }
): string | null {
  const valid = (date: string) =>
    /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    Number.isFinite(Date.parse(date)) &&
    new Date(date).toISOString().slice(0, 10) === date;
  if (
    !a.city ||
    a.city !== b.city ||
    ![a.start, a.end, b.start, b.end].every(valid) ||
    a.start > a.end ||
    b.start > b.end
  )
    return null;
  const start = a.start > b.start ? a.start : b.start;
  const end = a.end < b.end ? a.end : b.end;
  return start <= end ? `${start} → ${end}` : null;
}
