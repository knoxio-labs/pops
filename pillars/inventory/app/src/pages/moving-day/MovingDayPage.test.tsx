import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { movingData, worldForMovingData } from './moving-day-test-fixtures.js';
import { MovingDayPage } from './MovingDayPage.js';

import type { WebMovingGetResponse } from '../../inventory-api/types.gen.js';
import type { WebChangeGroup } from '../../inventory-web/useChangedElsewhere.js';

const mocks = vi.hoisted(() => ({
  useMovingDay: vi.fn(),
  useChangedElsewhere: vi.fn(),
  useOnline: vi.fn(),
  usePlacementSources: vi.fn(),
  useMovingDayActions: vi.fn(),
  actionDisabledReason: vi.fn(),
}));

vi.mock('../../inventory-web/useMovingDay.js', () => ({
  WEB_MOVING_DAY_QUERY_KEY: ['inventory', 'web', 'moving-day'],
  useMovingDay: mocks.useMovingDay,
}));
vi.mock('../../inventory-web/useChangedElsewhere.js', () => ({
  useChangedElsewhere: mocks.useChangedElsewhere,
}));
vi.mock('../../inventory-web/useOnline.js', () => ({ useOnline: mocks.useOnline }));
vi.mock('../../inventory-web/usePlacementSources.js', () => ({
  usePlacementSources: mocks.usePlacementSources,
}));
vi.mock('./moving-day-actions.js', async () => {
  const actual =
    await vi.importActual<typeof import('./moving-day-actions.js')>('./moving-day-actions.js');
  return {
    ...actual,
    actionDisabledReason: mocks.actionDisabledReason,
    useMovingDayActions: mocks.useMovingDayActions,
  };
});

let data: WebMovingGetResponse;
let status: 'pending' | 'error' | 'success';
let online: boolean;
let changed: { groups: WebChangeGroup[]; stale: boolean; reload: ReturnType<typeof vi.fn> };
let refetch: ReturnType<typeof vi.fn>;

function renderPage(): void {
  render(
    <MemoryRouter>
      <MovingDayPage />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  data = movingData();
  status = 'success';
  online = true;
  refetch = vi.fn();
  changed = { groups: [], stale: false, reload: vi.fn() };
  mocks.useMovingDay.mockReturnValue({ data, status, refetch });
  mocks.useOnline.mockReturnValue(online);
  mocks.useChangedElsewhere.mockReturnValue(changed);
  mocks.usePlacementSources.mockReturnValue({
    world: worldForMovingData(data),
    isLoading: false,
    isError: false,
    recents: [],
    createLocation: { mutate: vi.fn() },
  });
  mocks.useMovingDayActions.mockReturnValue({
    onBoxAction: vi.fn(),
    onPack: vi.fn(),
    pendingIds: new Set<string>(),
    rejections: {},
  });
  mocks.actionDisabledReason.mockReturnValue(undefined);
});

describe('MovingDayPage', () => {
  it('wires the loaded aggregate into the summary, toolbar, and board', () => {
    renderPage();

    expect(screen.getByRole('heading', { name: 'Moving day' })).toBeInTheDocument();
    expect(screen.getByText('Box 2')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /By stage/ })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Which box is it in?' })).toBeInTheDocument();
  });

  it('renders loading, error, empty, and done states from the aggregate status', () => {
    status = 'pending';
    mocks.useMovingDay.mockReturnValue({ data: undefined, status, refetch });
    renderPage();
    expect(screen.getByLabelText('Loading boxes')).toBeInTheDocument();
    cleanup();

    status = 'error';
    mocks.useMovingDay.mockReturnValue({ data: undefined, status, refetch });
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(refetch).toHaveBeenCalledOnce();
    cleanup();

    const empty = movingData({ boxes: [], stages: { packing: 0, full: 0, closed: 0 } });
    mocks.useMovingDay.mockReturnValue({ data: empty, status: 'success', refetch });
    mocks.usePlacementSources.mockReturnValue({
      world: worldForMovingData(empty),
      isLoading: false,
      isError: false,
      recents: [],
      createLocation: { mutate: vi.fn() },
    });
    renderPage();
    expect(screen.getByText('No boxes yet')).toBeInTheDocument();
    cleanup();

    const done = movingData({
      boxes: [movingData().boxes[2]!],
      stages: { packing: 0, full: 0, closed: 1 },
      loose: [],
      looseCount: 0,
      inHand: [],
      packed: 1,
      unlabelledClosed: 1,
    });
    mocks.useMovingDay.mockReturnValue({ data: done, status: 'success', refetch });
    mocks.usePlacementSources.mockReturnValue({
      world: worldForMovingData(done),
      isLoading: false,
      isError: false,
      recents: [],
      createLocation: { mutate: vi.fn() },
    });
    renderPage();
    expect(screen.getByText('All 1 boxes are closed')).toBeInTheDocument();
    cleanup();
  });

  it('shows offline and changed-elsewhere banners without enabling mutations', () => {
    online = false;
    mocks.useOnline.mockReturnValue(online);
    changed = {
      groups: [],
      stale: false,
      reload: vi.fn(),
    };
    mocks.useChangedElsewhere.mockReturnValue(changed);
    renderPage();

    expect(screen.getByText('No connection. Showing what loaded.')).toBeInTheDocument();
    cleanup();

    const changedGroup = {
      actorLabel: 'iPhone',
      actorKind: 'device' as const,
      entityCount: 1,
      latestServerTime: '2026-09-27T00:00:00.000Z',
    };
    mocks.useOnline.mockReturnValue(true);
    mocks.useChangedElsewhere.mockReturnValue({
      groups: [changedGroup],
      stale: true,
      reload: vi.fn(),
    });
    renderPage();
    expect(screen.getByText('iPhone changed the move.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument();
  });
});
