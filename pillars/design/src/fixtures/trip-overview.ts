/** A fictional planning item; intention never implies a booking. */
export interface TripOverviewItem {
  id: string;
  title: string;
  kind: 'city' | 'transport' | 'stay' | 'event' | 'person' | 'idea';
  where: string;
  when: string;
  intention: 'In plan' | 'Considering' | 'Alternative';
  arrangement: 'Booked' | 'Agreed' | 'Not arranged' | 'Not needed';
  notes: string;
}

/** Shared fictional data for all overview proposals; no actual booking details. */
export const tripOverviewItems: TripOverviewItem[] = [
  {
    id: 'flight',
    title: 'Melbourne → São Paulo',
    kind: 'transport',
    where: 'São Paulo',
    when: '18–19 Nov · via Santiago',
    intention: 'In plan',
    arrangement: 'Booked',
    notes:
      'An overnight journey. Departure and arrival are on different local dates. A fictional booking anchors the beginning; the return is open.',
  },
  {
    id: 'arrival',
    title: 'A soft landing',
    kind: 'city',
    where: 'São Paulo',
    when: '19 Nov → early December',
    intention: 'Considering',
    arrangement: 'Not arranged',
    notes:
      'A few days to arrive, or a longer base? Nothing requires choosing the departure date yet.',
  },
  {
    id: 'family',
    title: 'Summer with family',
    kind: 'city',
    where: 'Porto Alegre',
    when: 'Around 20–27 Dec',
    intention: 'In plan',
    arrangement: 'Not arranged',
    notes:
      'Being here matters. Travel and somewhere to sleep still need arranging. The city commitment is separate from those bookings.',
  },
  {
    id: 'host',
    title: 'Visit Clara',
    kind: 'person',
    where: 'Porto Alegre',
    when: 'Available 19–28 Dec',
    intention: 'Considering',
    arrangement: 'Not arranged',
    notes:
      'Fictional contact. Catching up is possible; staying with Clara has not been agreed. Her availability helps shape this visit.',
  },
  {
    id: 'olinda',
    title: 'New year on the coast',
    kind: 'city',
    where: 'Olinda',
    when: '29 Dec–3 Jan · extension open',
    intention: 'In plan',
    arrangement: 'Not arranged',
    notes:
      'The guesthouse fixes five nights. Arrival transport and any extension are separate decisions.',
  },
  {
    id: 'hotel',
    title: 'Guesthouse near the old town',
    kind: 'stay',
    where: 'Olinda',
    when: '29 Dec–3 Jan · 5 nights',
    intention: 'In plan',
    arrangement: 'Booked',
    notes:
      'Fictional accommodation. The stay anchors these nights, but the flight to Recife is still missing. Sample cancellation deadline: 10 December.',
  },
  {
    id: 'connection',
    title: 'Porto Alegre → Recife',
    kind: 'transport',
    where: 'Olinda',
    when: 'Around 28–29 Dec',
    intention: 'Considering',
    arrangement: 'Not arranged',
    notes:
      'Compare arriving a day early with travelling straight to the guesthouse. Both options stay open until a flight is chosen.',
  },
  {
    id: 'minas',
    title: 'A base for meeting people',
    kind: 'city',
    where: 'Belo Horizonte',
    when: 'January · perhaps 2–3 weeks',
    intention: 'Considering',
    arrangement: 'Not arranged',
    notes:
      'Go for the social life, not a sightseeing checklist. Look for a neighbourhood and places where meeting people happens naturally.',
  },
  {
    id: 'festival',
    title: 'An independent music weekend',
    kind: 'event',
    where: 'Belo Horizonte',
    when: '16–18 Jan · sample dates',
    intention: 'Considering',
    arrangement: 'Not arranged',
    notes:
      'A fictional event discovered while planning. It could pull the January base earlier and shorten time on the coast. These are invented dates, not event advice.',
  },
  {
    id: 'coast',
    title: 'Stay longer by the coast',
    kind: 'idea',
    where: 'Olinda',
    when: 'Early–mid January',
    intention: 'Alternative',
    arrangement: 'Not arranged',
    notes:
      'An alternative to heading inland straight away. Keep it available while comparing the music weekend and friends’ calendars.',
  },
  {
    id: 'rio',
    title: 'Carnival, possibly',
    kind: 'city',
    where: 'Rio de Janeiro',
    when: 'February · dates to check',
    intention: 'Considering',
    arrangement: 'Not arranged',
    notes:
      'Likely, but not settled. Decide the city and company before booking accommodation. No festival date is asserted by this fixture.',
  },
  {
    id: 'friend',
    title: 'Meet Rafael',
    kind: 'person',
    where: 'Rio de Janeiro',
    when: 'February · awaiting dates',
    intention: 'Considering',
    arrangement: 'Not arranged',
    notes:
      'A fictional friend may be around. Their calendar could change when this part of the trip makes sense.',
  },
];

/** Competing overview structures, presented without an approved choice. */
export const tripOverviewProposals = [
  {
    id: 'route-first',
    title: 'A · Route first',
    lead: 'Where am I going, and what is still open?',
    description:
      'A chronological spine with gaps and flexible periods. Decisions and possibilities sit alongside it.',
    tradeoff: 'The shape of the trip is immediate; undated discoveries get less space.',
    question: 'Does a route help you think when most of its dates are still uncertain?',
  },
  {
    id: 'decision-first',
    title: 'B · Decisions first',
    lead: 'What would move this plan forward?',
    description:
      'Open questions lead, with competing options visible. A compact route keeps the wider trip in view.',
    tradeoff: 'Next actions are clear; browsing the trip can feel more like managing tasks.',
    question: 'Do explicit decisions help, or make planning feel like an obligation?',
  },
  {
    id: 'places-first',
    title: 'C · Places first',
    lead: 'Where could I spend my time?',
    description:
      'City workspaces gather events, people and arrangements. Dates can remain rough while places develop.',
    tradeoff: 'Exploration has room; chronological gaps and transport are less prominent.',
    question: 'Is a city the right container, including when you might visit it twice?',
  },
] as const;

/** Layout identifiers shared by the experiment and its prototype links. */
export type TripOverviewLayout = (typeof tripOverviewProposals)[number]['id'];
