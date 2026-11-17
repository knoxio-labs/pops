import { cleanup, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';

import { captureSource, sourceCapture, sourceIdea } from '../capture/test-utils';
import { meetingPlan } from '../people/test-utils';
import { mountOverview } from './render.test-utils';
import { overviewResponses } from './test-utils';

afterEach(cleanup);

it('opens exact contextual source identities with no source destination links', async () => {
  const responses = overviewResponses();
  responses.set('/trips/7/meeting-plans', { meetingPlans: [meetingPlan({ visitId: 31 })] });
  const capture = captureSource([
    sourceCapture({ tripId: 7, visitId: 32, title: 'Original note' }),
  ]);
  capture.ideas = [sourceIdea({ id: 41, tripId: 7, name: 'Museum idea', visitId: 31 })];
  responses.set('/trips/7/capture-workspace', capture);
  const onOpenSource = vi.fn();
  mountOverview(responses, undefined, { onOpenSource });
  await userEvent.click(await screen.findByRole('button', { name: 'Coffee' }));
  expect(onOpenSource).toHaveBeenLastCalledWith({ kind: 'meeting', id: 41 });
  await userEvent.click(screen.getByRole('button', { name: 'Museum idea' }));
  expect(onOpenSource).toHaveBeenLastCalledWith({ kind: 'idea', id: 41 });
  await userEvent.click(screen.getByRole('button', { name: 'Original note' }));
  expect(onOpenSource).toHaveBeenLastCalledWith({ kind: 'capture', id: 1 });
  expect(
    screen.queryByRole('link', { name: /Coffee|Museum idea|Original note/ })
  ).not.toBeInTheDocument();
});

it('keeps host controls inside the Timeline and the contextual editor outside its main landmark', async () => {
  mountOverview(overviewResponses(), undefined, {
    controls: <button type="button">Open contextual People</button>,
    contextualEditor: <aside aria-label="Existing editor">Canonical editor</aside>,
    calendarLink: { href: '/trips/7/calendar', label: 'Calendar destination' },
  });
  const main = await screen.findByRole('main');
  expect(within(main).getByRole('button', { name: 'Open contextual People' })).toBeVisible();
  expect(screen.getByRole('complementary', { name: 'Existing editor' })).not.toContainElement(main);
  expect(main).not.toContainElement(screen.getByRole('complementary', { name: 'Existing editor' }));
  expect(screen.queryByRole('link', { name: 'Calendar destination' })).not.toBeInTheDocument();
});

it('keeps the whole workspace width when no contextual editor is selected', async () => {
  const { rerender } = mountOverview(overviewResponses());
  const main = await screen.findByRole('main');
  expect(main.parentElement).not.toHaveClass('xl:grid-cols-3');
  expect(main).not.toHaveClass('xl:col-span-2');
  rerender({ contextualEditor: <aside aria-label="Selected editor">Exact source</aside> });
  expect(main.parentElement).toHaveClass('xl:grid-cols-3');
  rerender({ contextualEditor: undefined });
  expect(screen.queryByRole('complementary', { name: 'Selected editor' })).not.toBeInTheDocument();
  expect(main.parentElement).not.toHaveClass('xl:grid-cols-3');
});
