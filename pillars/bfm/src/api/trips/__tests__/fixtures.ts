import type { MobileTripDetail } from '../../../contract/mobile-trips-detail-schemas.js';
import type { MobileTripEvent } from '../../../contract/mobile-trips-event-schemas.js';

const audit = { createdAt: '2027-01-01T00:00:00Z', updatedAt: '2027-01-02T00:00:00Z' };
function routeFacts(): Pick<MobileTripDetail, 'trip' | 'places' | 'visits'> {
  const trip = {
    id: 7,
    name: null,
    destination: 'Brasil',
    when: 'Christmas and summer',
    tagId: null,
    parentId: null,
    notes: 'Original trip note',
    sourceLinks: [],
    ...audit,
  };
  const places = [
    { id: 11, name: 'São Paulo', sourceLinks: [], ...audit },
    { id: 12, name: 'Recife', sourceLinks: [], ...audit },
    { id: 13, name: 'Unrelated catalogue place', sourceLinks: [], ...audit },
  ];
  const visits = [
    {
      id: 22,
      tripId: 7,
      placeId: 11,
      timing: { arrival: '2027-12-29' },
      notes: 'First source occurrence',
      sourceLinks: [],
      ...audit,
    },
    {
      id: 21,
      tripId: 7,
      placeId: 11,
      timing: { month: { year: 2028, month: 2, part: 'early' as const } },
      notes: '',
      sourceLinks: [],
      ...audit,
    },
  ];
  return { trip, places, visits };
}
function journeyFacts(): MobileTripDetail['journeys'] {
  const leg = {
    id: 502,
    journeyId: 40,
    mode: 'flight',
    from: { placeId: 11, local: '2027-12-29T00:15', timeZone: 'America/Sao_Paulo' },
    to: { placeId: 12, sourceLabel: 'REC', local: '2027-12-29T03:40', timeZone: 'America/Recife' },
    intention: 'Considering' as const,
    arrangement: 'Agreed' as const,
    purchase: 'Purchased' as const,
    operator: null,
    service: null,
    reference: 'SOURCE-REF',
    notes: '',
    sourceLinks: [],
    ...audit,
  };
  return [
    {
      id: 40,
      tripId: 7,
      name: 'Same journey name',
      reference: 'SOURCE-REF',
      notes: '',
      sourceLinks: [],
      buffers: {},
      legs: [leg, { ...leg, id: 501, from: {}, to: {}, purchase: null }],
      ...audit,
    },
    {
      id: 41,
      tripId: 7,
      name: 'Same journey name',
      reference: null,
      notes: '',
      sourceLinks: [],
      buffers: {},
      legs: [{ ...leg, id: 503, journeyId: 41, intention: 'Alternative' as const, purchase: null }],
      ...audit,
    },
  ];
}
/** Fictional complete producer snapshot, with route and leg order deliberately independent of IDs. */
export function tripsFixture(): MobileTripDetail {
  return {
    ...routeFacts(),
    journeys: journeyFacts(),
    journeyGroups: [
      {
        id: 60,
        tripId: 7,
        currentJourneyId: 40,
        alternativeJourneyIds: [41],
        revision: 2,
        ...audit,
      },
    ],
    events: [],
    documentAssociations: [],
    stays: [
      {
        id: 70,
        tripId: 7,
        visitId: 21,
        name: 'Source stay',
        kind: 'hotel',
        status: 'Reserved',
        timing: { arrival: '2027-12-29', departure: '2028-01-03', timeZone: 'America/Recife' },
        address: 'Rua do Amparo, Olinda',
        reference: 'SOURCE-STAY',
        notes: '',
        sourceLinks: [],
        hostLinks: [{ uri: 'pops:contacts/entity/host-1' }],
        documentLinks: [{ uri: 'pops:documents/document/doc-1' }],
        ...audit,
      },
    ],
  };
}

/** Fictional canonical Event source with independent optional timing and lifecycle fields. */
export function tripsEventFixture(): MobileTripEvent {
  return {
    id: 80,
    tripId: 7,
    visitId: 21,
    name: 'Concert',
    intention: 'Alternative',
    arrangement: 'Not needed',
    purchase: null,
    timing: { start: '2028-01-02', endTime: '23:00', timeZone: 'America/Recife' },
    address: 'Rua da Aurora',
    reference: null,
    sourceUrl: null,
    ticketUrl: null,
    notes: '',
    sourceLinks: [],
    venueLinks: [{ uri: 'pops:contacts/entity/venue' }],
    organiserLinks: [],
    documentLinks: [{ uri: 'pops:documents/document/31' }],
    createdAt: '2027-01-01T00:00:00Z',
    updatedAt: '2027-01-02T00:00:00Z',
  };
}
