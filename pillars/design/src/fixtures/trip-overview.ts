import { presentTripRecord } from './trip-overview-format';
import { tripRouteArrangements } from './trip-route-arrangements';
import { tripRouteCities } from './trip-route-cities';

export type { TripOverviewItem } from './trip-overview-model';

/** Shared fictional route for all proposals, with no real tickets or personal records. */
export const tripOverviewRecords = [...tripRouteCities, ...tripRouteArrangements];

/** Display fields are deterministic projections and are not persisted as source data. */
export const tripOverviewItems = tripOverviewRecords.map((record) =>
  presentTripRecord(record, tripOverviewRecords)
);

/** Competing overview structures, presented without an approved choice. */
export const tripOverviewProposals = [
  {
    id: 'route-first',
    title: 'A · Route first',
    lead: 'Where am I going, and what is still open?',
    description:
      'Ordered city visits with uncertain dates, wanted events and purchased arrangements inline. Competing paths stay grouped in an open segment.',
    tradeoff: 'Inline events and purchases use more vertical space.',
    question:
      'Is the automatic detail level clear for approximate, order-only and dated city visits?',
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
