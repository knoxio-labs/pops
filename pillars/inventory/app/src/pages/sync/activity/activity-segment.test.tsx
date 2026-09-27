import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { buildWorld } from '../../../foundation/model/placement-model.js';
import { ActivitySegment } from './activity-segment.js';

import type { WebEvent } from '../../../inventory-web/useWebEvents.js';

const mocks = vi.hoisted(() => ({
  useWebEvents: vi.fn(),
  usePlacementSources: vi.fn(),
}));

vi.mock('../../../inventory-web/useWebEvents.js', () => ({ useWebEvents: mocks.useWebEvents }));
vi.mock('../../../inventory-web/usePlacementSources.js', () => ({
  usePlacementSources: mocks.usePlacementSources,
}));

const baseEvent: WebEvent = {
  actor: { kind: 'web', label: 'Joao on the web' },
  after: { name: 'New name' },
  before: { name: 'Old name' },
  clientTime: null,
  compensatesSeq: null,
  entityId: 'item-1',
  entityKind: 'item',
  entityName: 'Lamp',
  fields: ['name'],
  kind: 'edited',
  reason: null,
  seq: 1,
  serverTime: '2026-09-25T09:00:00Z',
  undoable: false,
};

function event(overrides: Partial<WebEvent> = {}): WebEvent {
  return { ...baseEvent, ...overrides };
}

function feed(events: readonly WebEvent[] = [event()]): ReturnType<typeof mocks.useWebEvents> {
  return {
    events,
    kindCounts: {},
    total: events.length,
    status: 'success',
    error: null,
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: vi.fn(),
    refetch: vi.fn(),
  };
}

function renderActivity(initialEntry = '/inventory/sync?segment=activity'): void {
  render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <ActivitySegment />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.usePlacementSources.mockReturnValue({
    world: buildWorld([], []),
    catalogue: { types: [] },
  });
  mocks.useWebEvents.mockReturnValue(feed());
});

describe('ActivitySegment', () => {
  it('opens a read-only detail sheet and renders structured changed fields safely', () => {
    mocks.useWebEvents.mockReturnValue(
      feed([
        event({
          after: { placement: { kind: 'location', locationId: 'room-1' } },
          before: { placement: { kind: 'hand' } },
          fields: ['placement'],
          kind: 'moved',
        }),
      ])
    );
    renderActivity();

    fireEvent.click(screen.getByRole('button', { name: /Moved to Unknown place, Lamp/u }));

    expect(screen.getByText('Changed fields')).toBeInTheDocument();
    expect(screen.getByTestId('before-placement')).toHaveTextContent('{"kind":"hand"}');
    expect(screen.getByTestId('after-placement')).toHaveTextContent(
      '{"kind":"location","locationId":"room-1"}'
    );
    expect(screen.queryByRole('button', { name: /Undo/u })).not.toBeInTheDocument();
  });

  it('renders empty and filtered-empty states with a clear action', () => {
    mocks.useWebEvents.mockReturnValue(feed([]));
    renderActivity();
    expect(screen.getByText('No changes yet')).toBeInTheDocument();

    cleanup();
    renderActivity('/inventory/sync?segment=activity&q=lamp');
    expect(screen.getByText('No change matches these filters')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(screen.getByText('No changes yet')).toBeInTheDocument();
  });

  it('renders loading and error states with retry', () => {
    mocks.useWebEvents.mockReturnValue({ ...feed([]), status: 'pending' });
    renderActivity();
    expect(screen.getByLabelText('Loading activity')).toBeInTheDocument();

    const refetch = vi.fn();
    mocks.useWebEvents.mockReturnValue({ ...feed([]), status: 'error', refetch });
    renderActivity();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(refetch).toHaveBeenCalledOnce();
  });
});
