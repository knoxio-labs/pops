import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DetailBanners } from './detail-banners.js';

import type { ItemRowModel } from '../../foundation/model/model.js';
import type { WebEvent } from '../../inventory-web/useWebEvents.js';

const mocks = vi.hoisted(() => ({ useWebEvents: vi.fn() }));

vi.mock('../../inventory-web/useWebEvents.js', () => ({ useWebEvents: mocks.useWebEvents }));

const item: ItemRowModel = {
  id: 'item-1',
  name: 'Desk lamp',
  typeId: null,
  typeName: null,
  code: null,
  quantity: 1,
  container: null,
  lifecycle: 'active',
  placement: { kind: 'location', locationId: 'study' },
  previous: null,
  sync: 'synced',
  photoUrl: null,
  note: null,
  updatedAt: '2026-09-01T00:00:00Z',
};

const event: WebEvent = {
  actor: { kind: 'device', label: 'Phone' },
  after: { lifecycle: 'retired' },
  before: { lifecycle: 'active' },
  clientTime: null,
  compensatesSeq: null,
  entityId: 'item-1',
  entityKind: 'item',
  entityName: 'Desk lamp',
  fields: ['lifecycle'],
  kind: 'lifecycle_changed',
  reason: 'Replaced',
  seq: 7,
  serverTime: '2026-09-01T05:06:00.000Z',
  undoable: false,
};

const baseFeed = {
  events: [event],
  kindCounts: {},
  total: 1,
  status: 'success' as const,
  error: null,
  hasNextPage: false,
  isFetchingNextPage: false,
  fetchNextPage: vi.fn(),
  refetch: vi.fn(),
};

function renderBanners(overrides: Partial<Parameters<typeof DetailBanners>[0]> = {}) {
  return render(
    <DetailBanners
      item={item}
      cases={[]}
      stale={null}
      offline={false}
      onReload={vi.fn()}
      onOpenCase={vi.fn()}
      {...overrides}
    />
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.useWebEvents.mockReturnValue(baseFeed);
});

describe('DetailBanners', () => {
  it('prioritises a conflict over offline and stale states', () => {
    const onOpenCase = vi.fn();
    renderBanners({
      cases: [
        {
          id: 'case-1',
          itemId: 'item-1',
          itemName: 'Desk lamp',
          kind: 'field',
          problem: 'The name',
          deviceId: 'phone',
          openedAt: '2026-09-01T05:00:00.000Z',
          mine: { at: '2026-09-01T05:00:00.000Z', source: 'Web', value: 'Desk lamp' },
          theirs: { at: '2026-09-01T05:01:00.000Z', source: 'Phone', value: 'Lamp' },
        },
      ],
      stale: { actorLabel: 'Phone', latestServerTime: '2026-09-01T05:00:00.000Z' },
      offline: true,
      onOpenCase,
    });

    expect(
      screen.getByText('The name was changed on Phone while you were editing it.')
    ).toBeInTheDocument();
    expect(screen.queryByText('No connection. Showing what loaded.')).not.toBeInTheDocument();
    screen.getByRole('button', { name: 'Resolve in Sync' }).click();
    expect(onOpenCase).toHaveBeenCalledWith('case-1');
  });

  it('renders stale copy and reloads the existing query baseline', () => {
    const onReload = vi.fn();
    renderBanners({
      stale: {
        actorLabel: 'Garage phone',
        latestServerTime: new Date(Date.now() - 60_000).toISOString(),
      },
      onReload,
    });

    expect(screen.getByText('Changed on Garage phone 1 minute ago.')).toBeInTheDocument();
    screen.getByRole('button', { name: 'Reload' }).click();
    expect(onReload).toHaveBeenCalledOnce();
  });

  it('renders the lifecycle notice only when the latest event matches the item', () => {
    renderBanners({ item: { ...item, lifecycle: 'retired' } });

    expect(screen.getByText(/Retired .* by Phone: Replaced/u)).toBeInTheDocument();
    expect(
      screen.getByText('Kept on record but out of lists unless you include inactive items.')
    ).toBeInTheDocument();
    expect(mocks.useWebEvents).toHaveBeenCalledWith({
      entityId: 'item-1',
      kinds: ['lifecycle_changed'],
      limit: 1,
    });
  });

  it('explains why an in-hand item cannot be put back after its place was deleted', () => {
    renderBanners({
      item: {
        ...item,
        placement: { kind: 'in-hand' },
        previous: { kind: 'deleted', name: 'Old study' },
      },
    });

    expect(
      screen.getByText('Picked up from Old study, which has since been deleted.')
    ).toBeInTheDocument();
    expect(screen.getByText('Put back has nowhere to go. Move it to choose a new place.'));
  });
});
