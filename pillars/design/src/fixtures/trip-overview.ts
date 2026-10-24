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
    notes: 'Outbound booked. Return flight not booked.',
  },
  {
    id: 'arrival',
    title: 'São Paulo',
    kind: 'city',
    where: 'São Paulo',
    when: '19 Nov → early December',
    intention: 'Considering',
    arrangement: 'Not arranged',
    notes: 'Arrival 19 November. Departure date undecided.',
  },
  {
    id: 'family',
    title: 'Porto Alegre',
    kind: 'city',
    where: 'Porto Alegre',
    when: 'Around 20–27 Dec',
    intention: 'In plan',
    arrangement: 'Not arranged',
    notes: 'Christmas with family. Travel and accommodation not arranged.',
  },
  {
    id: 'host',
    title: 'Clara',
    kind: 'person',
    where: 'Porto Alegre',
    when: 'Available 19–28 Dec',
    intention: 'Considering',
    arrangement: 'Not arranged',
    notes: 'Available 19–28 December. Meeting and accommodation not agreed.',
  },
  {
    id: 'olinda',
    title: 'Olinda',
    kind: 'city',
    where: 'Olinda',
    when: '29 Dec–3 Jan · extension open',
    intention: 'In plan',
    arrangement: 'Not arranged',
    notes: 'Hotel booked 29 December–3 January. Arrival transport and extension undecided.',
  },
  {
    id: 'hotel',
    title: 'Pousada do Largo',
    kind: 'stay',
    where: 'Olinda',
    when: '29 Dec–3 Jan · 5 nights',
    intention: 'In plan',
    arrangement: 'Booked',
    notes: 'Five nights. Cancellation deadline: 10 December. Confirmation document to attach.',
  },
  {
    id: 'connection',
    title: 'Porto Alegre → Recife',
    kind: 'transport',
    where: 'Olinda',
    when: 'Around 28–29 Dec',
    intention: 'Considering',
    arrangement: 'Not arranged',
    notes: 'Compare arrivals on 28 and 29 December. No flight selected.',
  },
  {
    id: 'minas',
    title: 'Belo Horizonte',
    kind: 'city',
    where: 'Belo Horizonte',
    when: 'January · perhaps 2–3 weeks',
    intention: 'Considering',
    arrangement: 'Not arranged',
    notes:
      'January, two or three weeks. Priority: meeting people. Neighbourhood and accommodation undecided.',
  },
  {
    id: 'festival',
    title: 'Festival Horizonte',
    kind: 'event',
    where: 'Belo Horizonte',
    when: '16–18 Jan · sample dates',
    intention: 'Considering',
    arrangement: 'Not arranged',
    notes:
      'Sample event, 16–18 January. Check tickets and dates before changing the January route.',
  },
  {
    id: 'coast',
    title: 'Extend Olinda stay',
    kind: 'idea',
    where: 'Olinda',
    when: 'Early–mid January',
    intention: 'Alternative',
    arrangement: 'Not arranged',
    notes: 'Alternative to Belo Horizonte in early January. Dates and accommodation not selected.',
  },
  {
    id: 'rio',
    title: 'Rio de Janeiro',
    kind: 'city',
    where: 'Rio de Janeiro',
    when: 'February · dates to check',
    intention: 'Considering',
    arrangement: 'Not arranged',
    notes:
      'Possible February base for Carnival. Event dates, accommodation and transport not confirmed.',
  },
  {
    id: 'friend',
    title: 'Rafael',
    kind: 'person',
    where: 'Rio de Janeiro',
    when: 'February · awaiting dates',
    intention: 'Considering',
    arrangement: 'Not arranged',
    notes: 'February availability not confirmed. Contact before choosing dates.',
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
