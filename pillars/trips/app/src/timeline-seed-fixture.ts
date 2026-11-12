import { unwrap } from '@pops/pillar-sdk/client';

import {
  capturesCreate,
  decisionsCreate,
  eventsCreate,
  ideasCreate,
  journeysCreate,
  meetingPlansOperate,
  placesCreate,
  rentalsCreate,
  staysCreate,
  visitsCreate,
} from './trips-api/sdk.gen';

import type { timelineProducer } from './timeline-producer-fixture';

/** Seed literal independent source identities through the real producer's generated REST operations. */
export async function seedTimeline(owner: Awaited<ReturnType<typeof timelineProducer>>) {
  const { client, tripId } = owner;
  const path = { tripId };
  const place = unwrap(await placesCreate({ client, body: { name: 'Host city' } }));
  const visit = unwrap(
    await visitsCreate({ client, path, body: { placeId: place.id, notes: 'Host visit notes' } })
  );
  const stay = unwrap(
    await staysCreate({ client, path, body: { name: 'Host stay', visitId: visit.id } })
  );
  const event = unwrap(
    await eventsCreate({ client, path, body: { name: 'Host event', visitId: visit.id } })
  );
  const journey = unwrap(await journeysCreate({ client, path, body: { name: 'Host journey' } }));
  const decision = unwrap(
    await decisionsCreate({ client, path, body: { question: 'Host decision' } })
  );
  const rental = unwrap(
    await rentalsCreate({
      client,
      path,
      body: { provider: 'Host rental', pickupVisitId: visit.id, returnVisitId: visit.id },
    })
  );
  const { meeting, capture, idea } = await seedContext(owner, visit.id);
  owner.requests.length = 0;
  return {
    place,
    visit,
    stay,
    event,
    journey,
    decision,
    rental,
    meeting,
    capture,
    idea,
  };
}

async function seedContext(owner: Awaited<ReturnType<typeof timelineProducer>>, visitId: number) {
  const { client, tripId } = owner;
  const path = { tripId };
  const meeting = unwrap(
    await meetingPlansOperate({
      client,
      path,
      body: {
        operationId: crypto.randomUUID(),
        command: {
          kind: 'create',
          input: {
            contactUri: 'pops:contacts/contact/fixture-canonical',
            title: 'Host meeting',
            visitId,
          },
        },
      },
    })
  );
  const captured = unwrap(
    await capturesCreate({
      client,
      path,
      body: {
        operationId: crypto.randomUUID(),
        command: {
          kind: 'capture.create',
          input: { originalText: 'Host capture', visitId },
        },
      },
    })
  );
  const ideas = unwrap(
    await ideasCreate({
      client,
      path,
      body: {
        operationId: crypto.randomUUID(),
        command: { kind: 'idea.create', input: { name: 'Host idea', visitId } },
      },
    })
  );
  const capture = captured.current.captures.find((item) => item.originalText === 'Host capture');
  const idea = ideas.current.ideas.find((item) => item.name === 'Host idea');
  if (!capture || !idea) throw new Error('Producer did not return seeded sources');
  return { meeting: meeting.current, capture, idea };
}
