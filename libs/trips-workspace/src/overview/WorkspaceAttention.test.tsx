import { cleanup, screen, within } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';

import { routeRead } from '../route/test-utils';
import { sourceVisits } from '../stay/test-utils';
import { mountOverview } from './render.test-utils';
import { overviewResponses } from './test-utils';

afterEach(cleanup);

it('summarizes open nights, route gaps, undated visits and unresolved references', async () => {
  const responses = overviewResponses();
  responses.set('/trips/7/visits', {
    visits: [...sourceVisits, { ...sourceVisits[0]!, id: 32, timing: {} }],
  });
  responses.set('/trips/7/stays', { stays: [] });
  responses.set('/trips/7/events', { events: [] });
  responses.set(
    '/trips/7/route',
    routeRead({
      order: [
        { kind: 'visit', id: 31 },
        { kind: 'gap', id: 90 },
        { kind: 'visit', id: 999 },
      ],
      missingSources: [{ kind: 'visit', id: 999 }],
    })
  );

  mountOverview(responses);

  const panel = await screen.findByRole('region', { name: 'Before you go' });
  expect(within(panel).getByText('workspace.openNights')).toBeVisible();
  expect(within(panel).getByText('workspace.nightCoverage')).toBeVisible();
  expect(within(panel).getByText('workspace.routeGaps')).toBeVisible();
  expect(within(panel).getByText('workspace.datesOpen')).toBeVisible();
  expect(within(panel).getByText('workspace.referencesNeedReview')).toBeVisible();
  expect(within(panel).getByText('11')).toBeVisible();
});
