import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { afterEach, expect, it } from 'vitest';

import { sourceVisit, visitTransport } from './test-utils';
import english from './translation.test-fixture.json';
import { useVisitEditor } from './use-visit-editor';
import { VisitApproximateTiming } from './VisitApproximateTiming';

import type { Visit, VisitWorkspaceProps } from './types';

const locale = createInstance();
await locale.init({
  lng: 'en-AU',
  resources: { 'en-AU': { trips: { visitWorkspace: english } } },
  interpolation: { escapeValue: false },
});
afterEach(cleanup);

function Timing({ initial, identity }: { initial: Visit; identity: VisitWorkspaceProps }) {
  const editor = useVisitEditor(initial, identity);
  return (
    <VisitApproximateTiming
      visit={editor.draft}
      edit={editor.edit}
      commit={editor.commit}
      timingDrafts={editor.timingDrafts}
    />
  );
}

it('retains invalid month and duration text across canonical editor remounts without sending a patch', () => {
  const initial = sourceVisit({ timing: {} });
  const transport = visitTransport();
  const cache = new QueryClient();
  const identity = { client: transport.client, tripId: 7, visitId: 31 };
  const mount = () =>
    render(
      <I18nextProvider i18n={locale}>
        <QueryClientProvider client={cache}>
          <Timing initial={initial} identity={identity} />
        </QueryClientProvider>
      </I18nextProvider>
    );
  const first = mount();
  fireEvent.change(screen.getByLabelText('Year'), { target: { value: '2029' } });
  fireEvent.change(screen.getByLabelText('Month'), { target: { value: '13' } });
  fireEvent.blur(screen.getByLabelText('Month'));
  fireEvent.change(screen.getByLabelText('Minimum duration'), { target: { value: '4' } });
  fireEvent.change(screen.getByLabelText('Maximum duration'), { target: { value: '2' } });
  fireEvent.change(screen.getByLabelText('Duration unit'), { target: { value: 'days' } });
  expect(screen.getByText(english.monthInvalid)).toBeInTheDocument();
  expect(screen.getByText(english.durationOrder)).toBeInTheDocument();
  first.unmount();
  cache.clear();
  mount();
  expect(screen.getByLabelText('Year')).toHaveValue(2029);
  expect(screen.getByLabelText('Month')).toHaveValue(13);
  expect(screen.getByLabelText('Minimum duration')).toHaveValue(4);
  expect(screen.getByLabelText('Maximum duration')).toHaveValue(2);
  expect(screen.getByLabelText('Duration unit')).toHaveValue('days');
  expect(screen.getByText(english.monthInvalid)).toBeInTheDocument();
  expect(screen.getByText(english.durationOrder)).toBeInTheDocument();
  expect(transport.patches).toEqual([]);
});
