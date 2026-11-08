/** A source wall clock with an explicit location reference and IANA zone. */
export interface JourneyEndpoint {
  locationId: string;
  local: string;
  timeZone: string;
}
/** A source segment; clocks and purchase facts remain independent. */
export interface JourneyLeg {
  id: string;
  mode: 'flight' | 'train' | 'bus' | 'car' | 'ferry' | 'walk';
  from: JourneyEndpoint;
  to: JourneyEndpoint;
  status: 'Considering' | 'Reserved' | 'Purchased';
  reference: string;
  operator: string;
  service: string;
}
/** Fictional selectable location metadata, including its explicit display zone. */
export interface JourneyLocation {
  id: string;
  name: string;
  code: string;
  timeZone: string;
}
/** An attachment selectable independently of its presence in the catalogue. */
export interface JourneyDocument {
  id: string;
  name: string;
}
/** Nearby source context, with precise endpoints rather than travel estimates. */
export interface JourneyContextItem {
  id: string;
  title: string;
  kind: 'event' | 'stay' | 'transfer';
  start: JourneyEndpoint;
  end: JourneyEndpoint;
}
/** Editable local prototype data; buffers are user configuration, never airport policy. */
export interface JourneyState {
  legs: JourneyLeg[];
  locations: JourneyLocation[];
  documents: JourneyDocument[];
  documentIds: string[];
  reference: string;
  notes: string;
  minimumConnectionMinutes: number;
  airportBufferMinutes: number;
  context: JourneyContextItem[];
}
/** A derived contradiction or missing source fact, linked to affected legs. */
export interface JourneyFinding {
  id: string;
  kind: 'conflict' | 'gap';
  title: string;
  detail: string;
  legIds: string[];
}
/** Named fictional source states for the experiment controls. */
export type JourneyScenario =
  | 'default'
  | 'empty'
  | 'overnight'
  | 'tight-connection'
  | 'missing-reference';

function endpoint(locationId: string, local: string, timeZone: string): JourneyEndpoint {
  return { locationId, local, timeZone };
}
function legs(scenario: JourneyScenario): JourneyLeg[] {
  const overnight = scenario === 'overnight';
  let departure = '2028-01-15T11:00';
  if (overnight) departure = '2028-01-16T09:00';
  if (scenario === 'tight-connection') departure = '2028-01-15T09:00';
  return [
    {
      id: 'syd-dfw',
      mode: 'flight',
      from: endpoint('syd', '2028-01-15T10:00', 'Australia/Sydney'),
      to: endpoint('dfw', '2028-01-15T08:15', 'America/Chicago'),
      status: 'Purchased',
      reference: 'SAMPLE123',
      operator: 'Example Air',
      service: 'EX 101',
    },
    {
      id: 'dfw-gru',
      mode: 'flight',
      from: endpoint('dfw', departure, 'America/Chicago'),
      to: endpoint('gru', overnight ? '2028-01-17T00:30' : '2028-01-16T00:30', 'America/Sao_Paulo'),
      status: 'Purchased',
      reference: 'SAMPLE123',
      operator: 'Example Air',
      service: 'EX 202',
    },
  ];
}
/** Returns independent fictional 2028 source data; none of these records represent real bookings. */
export function initialJourney(scenario: JourneyScenario): JourneyState {
  const arrivalDay = scenario === 'overnight' ? '2028-01-17' : '2028-01-16';
  const state: JourneyState = {
    legs: scenario === 'empty' ? [] : legs(scenario),
    locations: [
      { id: 'syd', name: 'Sydney Airport', code: 'SYD', timeZone: 'Australia/Sydney' },
      { id: 'dfw', name: 'Dallas Fort Worth Airport', code: 'DFW', timeZone: 'America/Chicago' },
      {
        id: 'gru',
        name: 'São Paulo Guarulhos Airport',
        code: 'GRU',
        timeZone: 'America/Sao_Paulo',
      },
      { id: 'stay', name: 'Example São Paulo Stay', code: 'STAY', timeZone: 'America/Sao_Paulo' },
      { id: 'office', name: 'Example Sydney Office', code: 'OFFICE', timeZone: 'Australia/Sydney' },
    ],
    documents: [
      { id: 'itinerary', name: 'Fictional itinerary.pdf' },
      { id: 'receipt', name: 'Fictional receipt.pdf' },
    ],
    documentIds: scenario === 'missing-reference' ? ['unavailable-document'] : ['itinerary'],
    reference: 'SAMPLE123',
    notes:
      scenario === 'overnight'
        ? 'Fictional planning data.'
        : 'Fictional planning data. Arrival transfer is intentionally not recorded.',
    minimumConnectionMinutes: 90,
    airportBufferMinutes: 180,
    context: [
      ...arrivalTransfer(scenario, arrivalDay),
      {
        id: 'preflight',
        title: 'Example project handover',
        kind: 'event',
        start: endpoint('office', '2028-01-15T06:00', 'Australia/Sydney'),
        end: endpoint('office', '2028-01-15T08:00', 'Australia/Sydney'),
      },
      {
        id: 'stay',
        title: 'Example São Paulo stay',
        kind: 'stay',
        start: endpoint('stay', `${arrivalDay}T03:00`, 'America/Sao_Paulo'),
        end: endpoint('stay', '2028-01-20T10:00', 'America/Sao_Paulo'),
      },
    ],
  };
  return scenario === 'empty'
    ? { ...state, documentIds: [], reference: '', notes: '', context: [] }
    : state;
}

/** Authoritative mode choices for this local prototype. */
export const transportModes: { id: JourneyLeg['mode']; label: string }[] = [
  { id: 'flight', label: 'Flight' },
  { id: 'train', label: 'Train' },
  { id: 'bus', label: 'Bus' },
  { id: 'car', label: 'Car' },
  { id: 'ferry', label: 'Ferry' },
  { id: 'walk', label: 'Walk' },
];

function arrivalTransfer(scenario: JourneyScenario, arrivalDay: string): JourneyContextItem[] {
  if (scenario !== 'overnight') return [];
  return [
    {
      id: 'arrival-transfer',
      title: 'Example arrival transfer',
      kind: 'transfer',
      start: endpoint('gru', `${arrivalDay}T01:00`, 'America/Sao_Paulo'),
      end: endpoint('stay', `${arrivalDay}T02:00`, 'America/Sao_Paulo'),
    },
  ];
}
