import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it } from 'vitest';
import { z } from 'zod';

import { timelineRouteOwner } from './timeline-route-fixture';

import type { RouteItem, RouteSource, TripRoute } from '@pops/trips-workspace';

const initial: TripRoute & { order: [RouteItem, RouteItem, RouteItem] } = {
  tripId: 7,
  revision: 0,
  order: [
    { kind: 'visit', id: 11 },
    { kind: 'gap', id: 4 },
    { kind: 'journey', id: 22 },
  ],
  paths: [],
};
let owner: Awaited<ReturnType<typeof timelineRouteOwner>>;
afterEach(() => {
  cleanup();
  owner.cache.clear();
});

async function writeCount(count: number) {
  await waitFor(() => expect(owner.posts).toHaveLength(count));
  await waitFor(() =>
    screen
      .getAllByRole('button', { name: 'timeline.route.reload' })
      .forEach((button) => expect(button).toBeEnabled())
  );
}

it('creates gaps at exact anchors and at the end, and preserves root reorder boundaries', async () => {
  owner = await timelineRouteOwner(initial);
  const order: [RouteItem, RouteItem, RouteItem, RouteItem, RouteItem] = [
    initial.order[0],
    initial.order[1],
    { kind: 'gap' as const, id: 5 },
    initial.order[2],
    { kind: 'gap' as const, id: 6 },
  ];
  owner.replies.push(
    { ...initial, revision: 1, order: order.slice(0, 4) },
    { ...initial, revision: 2, order },
    { ...initial, revision: 3, order: [order[1], order[0], ...order.slice(2)] }
  );
  owner.mount();
  const user = userEvent.setup();
  expect(await screen.findByRole('button', { name: 'Up Visit #11' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Down Journey #22' })).toBeDisabled();
  await user.click(screen.getByRole('button', { name: 'Gap before Journey #22' }));
  await writeCount(1);
  await user.click(screen.getByRole('button', { name: 'timeline.route.addGap' }));
  await writeCount(2);
  await user.click(screen.getByRole('button', { name: 'Down Visit #11' }));
  await writeCount(3);
  expect(owner.posts).toEqual([
    expect.objectContaining({
      expectedRevision: 0,
      command: { kind: 'gap.create', before: { kind: 'journey', id: 22 } },
    }),
    expect.objectContaining({ expectedRevision: 1, command: { kind: 'gap.create', before: null } }),
    expect.objectContaining({
      expectedRevision: 2,
      command: {
        kind: 'route.reorder',
        order: [order[1], order[0], ...order.slice(2)],
      },
    }),
  ]);
});

it('creates an empty path at the actual gap, then explicitly places a source at its end', async () => {
  owner = await timelineRouteOwner(initial);
  const path = {
    id: 8,
    gapId: 4,
    title: '',
    state: 'alternative' as const,
    members: [],
  };
  owner.replies.push(
    { ...initial, revision: 1, paths: [path] },
    {
      ...initial,
      revision: 2,
      order: initial.order.slice(0, 2),
      paths: [{ ...path, members: [{ kind: 'journey', id: 22 }] }],
    }
  );
  owner.mount({ kind: 'gap', id: 4 }, { kind: 'journey', id: 22 });
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: 'timeline.route.createPath' }));
  await writeCount(1);
  await user.selectOptions(
    screen.getByRole('combobox', { name: 'timeline.route.destination' }),
    'path:8'
  );
  await user.click(screen.getByRole('button', { name: 'timeline.route.move' }));
  await writeCount(2);
  expect(owner.posts).toEqual([
    expect.objectContaining({ command: { kind: 'path.create', gapId: 4, title: '', members: [] } }),
    expect.objectContaining({
      command: {
        kind: 'source.move',
        source: { kind: 'journey', id: 22 },
        destination: { kind: 'path', pathId: 8, before: null },
      },
    }),
  ]);
});

it('moves a literal Visit to an exact root gap and permits explicit end placement', async () => {
  owner = await timelineRouteOwner(initial);
  owner.replies.push(
    {
      ...initial,
      revision: 1,
      order: [initial.order[0], { kind: 'visit', id: 33 }, ...initial.order.slice(1)],
    },
    { ...initial, revision: 2, order: [...initial.order, { kind: 'visit', id: 33 }] }
  );
  owner.mount(null, { kind: 'visit', id: 33 });
  const user = userEvent.setup();
  const move = await screen.findByRole('button', { name: 'timeline.route.move' });
  expect(move).toBeDisabled();
  await user.selectOptions(
    screen.getByRole('combobox', { name: 'timeline.route.destination' }),
    'route'
  );
  await user.selectOptions(
    screen.getByRole('combobox', { name: 'timeline.route.before' }),
    'gap:4'
  );
  await user.click(move);
  await writeCount(1);
  await user.selectOptions(screen.getByRole('combobox', { name: 'timeline.route.before' }), '');
  await user.click(move);
  await writeCount(2);
  expect(owner.posts).toEqual([
    expect.objectContaining({
      command: {
        kind: 'source.move',
        source: { kind: 'visit', id: 33 },
        destination: { kind: 'route', before: { kind: 'gap', id: 4 } },
      },
    }),
    expect.objectContaining({
      command: {
        kind: 'source.move',
        source: { kind: 'visit', id: 33 },
        destination: { kind: 'route', before: null },
      },
    }),
  ]);
});

it('reorders complete path membership and applies only an alternative path', async () => {
  const members: [RouteSource, RouteSource] = [
    { kind: 'visit' as const, id: 11 },
    { kind: 'journey' as const, id: 22 },
  ];
  const path = { id: 8, gapId: 4, title: 'Alternative', state: 'alternative' as const, members };
  const route = { ...initial, order: [{ kind: 'gap' as const, id: 4 }], paths: [path] };
  owner = await timelineRouteOwner(route);
  const reordered = { ...path, members: [members[1], members[0]] };
  owner.replies.push(
    { ...route, revision: 1, paths: [reordered] },
    { ...route, revision: 2, order: reordered.members, paths: [{ ...reordered, state: 'applied' }] }
  );
  owner.mount({ kind: 'path', id: 8 });
  const user = userEvent.setup();
  const region = await screen.findByRole('region', { name: 'Path #8' });
  expect(within(region).getAllByRole('button', { name: 'timeline.route.up' })[0]).toBeDisabled();
  const down = within(region).getAllByRole('button', { name: 'timeline.route.down' })[0];
  if (!down) throw new Error('Missing first member Down control');
  await user.click(down);
  await writeCount(1);
  await user.click(within(region).getByRole('button', { name: 'timeline.route.applyPath' }));
  await writeCount(2);
  expect(within(region).getByRole('button', { name: 'timeline.route.applyPath' })).toBeDisabled();
  expect(owner.posts).toEqual([
    expect.objectContaining({
      command: { kind: 'path.reorder', pathId: 8, members: reordered.members },
    }),
    expect.objectContaining({ command: { kind: 'path.apply', pathId: 8 } }),
  ]);
});

it('retries the retained exact unknown UUID after unmount, then Undo names its own receipt', async () => {
  owner = await timelineRouteOwner(initial);
  owner.replies.push(
    { ...initial, revision: 1, order: [...initial.order, { kind: 'gap', id: 5 }] },
    { ...initial, revision: 2 }
  );
  owner.loseNextWrite();
  const view = owner.mount();
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: 'timeline.route.addGap' }));
  await screen.findByRole('button', { name: 'retry' });
  view.unmount();
  owner.mount();
  await user.click(await screen.findByRole('button', { name: 'retry' }));
  await writeCount(2);
  expect(owner.posts[1]).toEqual(owner.posts[0]);
  await user.click(screen.getByRole('button', { name: 'timeline.route.undo' }));
  await writeCount(3);
  const original = z.object({ operationId: z.uuid() }).parse(owner.posts[0]);
  expect(owner.posts[2]).toEqual(
    expect.objectContaining({
      expectedRevision: 1,
      command: { kind: 'undo', targetOperationId: original.operationId },
    })
  );
});

it('moves a literal Journey before the exact Visit in a selected alternative', async () => {
  const member = { kind: 'visit' as const, id: 33 };
  const source = { kind: 'journey' as const, id: 22 };
  const path = {
    id: 8,
    gapId: 4,
    title: 'Alternate',
    state: 'alternative' as const,
    members: [member],
  };
  const route = { ...initial, paths: [path] };
  owner = await timelineRouteOwner(route);
  owner.replies.push({
    ...route,
    revision: 1,
    order: initial.order.slice(0, 2),
    paths: [{ ...path, members: [source, member] }],
  });
  owner.mount(null, source);
  const user = userEvent.setup();
  await screen.findByRole('region', { name: 'Path #8' });
  await user.selectOptions(
    screen.getByRole('combobox', { name: 'timeline.route.destination' }),
    'path:8'
  );
  await user.selectOptions(
    screen.getByRole('combobox', { name: 'timeline.route.before' }),
    'visit:33'
  );
  await user.click(screen.getByRole('button', { name: 'timeline.route.move' }));
  await writeCount(1);
  expect(owner.posts[0]).toEqual(
    expect.objectContaining({
      command: {
        kind: 'source.move',
        source,
        destination: { kind: 'path', pathId: 8, before: member },
      },
    })
  );
});

it('shows unavailable for a removed literal target without inventing a replacement gap', async () => {
  owner = await timelineRouteOwner(initial);
  owner.mount({ kind: 'gap', id: 99 });
  expect(await screen.findByRole('alert')).toHaveTextContent('timeline.route.unavailable');
  expect(
    screen.queryByRole('button', { name: 'timeline.route.createPath' })
  ).not.toBeInTheDocument();
  expect(owner.posts).toEqual([]);
});

it('recovers an unknown source move inside the remounted source context and retains own Undo', async () => {
  owner = await timelineRouteOwner(initial);
  const source = { kind: 'visit' as const, id: 11 };
  owner.replies.push(
    { ...initial, revision: 1, order: [initial.order[1], initial.order[2], source] },
    { ...initial, revision: 2 }
  );
  owner.loseNextWrite();
  const view = owner.mount(null, source, false);
  const user = userEvent.setup();
  await user.selectOptions(
    await screen.findByRole('combobox', { name: 'timeline.route.destination' }),
    'route'
  );
  await user.click(screen.getByRole('button', { name: 'timeline.route.move' }));
  expect(await screen.findByRole('status')).toHaveTextContent('timeline.route.uncertain');
  expect(screen.getByRole('alert')).toBeVisible();
  expect(screen.getByRole('button', { name: 'timeline.route.move' })).toBeDisabled();
  view.unmount();
  const reopened = owner.mount(null, source, false);
  await user.click(await screen.findByRole('button', { name: 'retry' }));
  await writeCount(2);
  expect(owner.posts[1]).toEqual(owner.posts[0]);
  expect(owner.posts[0]).toEqual(
    expect.objectContaining({
      command: {
        kind: 'source.move',
        source,
        destination: { kind: 'route', before: null },
      },
    })
  );
  reopened.unmount();
  owner.mount(null, source, false);
  await user.click(await screen.findByRole('button', { name: 'timeline.route.undo' }));
  await writeCount(3);
  const original = z.object({ operationId: z.uuid() }).parse(owner.posts[0]);
  expect(owner.posts[2]).toEqual(
    expect.objectContaining({
      expectedRevision: 1,
      command: { kind: 'undo', targetOperationId: original.operationId },
    })
  );
});
