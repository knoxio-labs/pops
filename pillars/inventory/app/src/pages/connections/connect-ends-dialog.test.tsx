import { QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@pops/pillar-sdk/client';

import { buildWorld } from '../../foundation/model/placement-model';
import { ShortcutProvider } from '../../foundation/shortcuts/shortcut-provider';
import { createTestQueryClient } from '../../inventory-web/test-utils';
import { ConnectEndsDialog } from './connect-ends-dialog';

import type { ReactElement } from 'react';

import type { ItemRowModel, LocationModel } from '../../foundation/model/model';
import type { WebConnectionRow } from '../../inventory-web/useConnectionsRegistry';
import type {
  ConnectionMutations,
  ConnectionsRegistry,
} from '../../inventory-web/useConnectionsRegistry';
import type { FixturesList, FixtureListRow } from '../../inventory-web/useFixtures';
import type { ItemRows } from '../../inventory-web/useWebItems';

const mocks = vi.hoisted(() => ({
  useAllConnections: vi.fn(),
  useConnectionMutations: vi.fn(),
  useFixtures: vi.fn(),
  useItemRows: vi.fn(),
  usePlacementSources: vi.fn(),
}));

vi.mock('../../inventory-web/useConnectionsRegistry', () => ({
  useAllConnections: mocks.useAllConnections,
  useConnectionMutations: mocks.useConnectionMutations,
}));
vi.mock('../../inventory-web/useFixtures', () => ({ useFixtures: mocks.useFixtures }));
vi.mock('../../inventory-web/useWebItems', () => ({ useItemRows: mocks.useItemRows }));
vi.mock('../../inventory-web/usePlacementSources', () => ({
  usePlacementSources: mocks.usePlacementSources,
}));

const home: LocationModel = { id: 'home', name: 'Home', parentId: null, kind: 'property' };
const bedroom: LocationModel = { id: 'bedroom', name: 'Bedroom', parentId: 'home', kind: 'room' };

function itemRow(
  id: string,
  name: string,
  lifecycle: ItemRowModel['lifecycle'] = 'active'
): ItemRowModel {
  return {
    id,
    name,
    typeId: null,
    typeName: null,
    code: null,
    quantity: 1,
    container: null,
    lifecycle,
    placement: { kind: 'location', locationId: 'bedroom' },
    previous: null,
    sync: 'synced',
    photoUrl: null,
    note: null,
    updatedAt: '2026-09-27T00:00:00.000Z',
  };
}

function fixtureRow(overrides: Partial<FixtureListRow> = {}): FixtureListRow {
  return {
    id: 'outlet',
    name: 'Bedside outlet',
    type: 'power',
    locationId: 'bedroom',
    notes: 'behind the table',
    createdAt: '2026-09-27T00:00:00.000Z',
    lastEditedTime: '2026-09-27T00:00:00.000Z',
    ...overrides,
  };
}

function itemRows(overrides: Partial<ItemRows> = {}): ItemRows {
  return {
    rows: [itemRow('lamp', 'Bedside lamp'), itemRow('soundbar', 'Soundbar')],
    total: 2,
    unfilteredTotal: 2,
    hiddenInactiveCount: 0,
    baseline: 2,
    hidden: 0,
    contentCounts: {},
    status: 'success',
    error: null,
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: vi.fn(),
    refetch: vi.fn(),
    ...overrides,
  };
}

function fixtures(overrides: Partial<FixturesList> = {}): FixturesList {
  return {
    rows: [fixtureRow()],
    total: 1,
    status: 'success',
    error: null,
    hasNextPage: false,
    fetchNextPage: vi.fn(),
    refetch: vi.fn(),
    ...overrides,
  };
}

function connectionRow(
  itemAId: string,
  itemAName: string,
  itemBId: string,
  itemBName: string
): WebConnectionRow {
  return {
    id: `connection-${itemAId}-${itemBId}`,
    createdAt: '2026-09-27T00:00:00.000Z',
    item: {
      id: itemAId,
      name: itemAName,
      code: null,
      kind: 'item',
      lifecycle: 'active',
      typeKey: null,
      isContainer: false,
    },
    far: {
      id: itemBId,
      name: itemBName,
      code: null,
      kind: 'item',
      lifecycle: 'active',
      typeKey: null,
      isContainer: false,
    },
  };
}

type ConnectionState = Pick<ConnectionsRegistry, 'rows' | 'status' | 'error'>;

let currentItemRows: ItemRows;
let currentFixtures: FixturesList;
let currentConnections: ConnectionState;
let placementLoading = false;
let placementError = false;

const connectItems = vi.fn<ConnectionMutations['connectItems']>();
const connectFixture = vi.fn<ConnectionMutations['connectFixture']>();

function dialogTree(
  queryClient: ReturnType<typeof createTestQueryClient>,
  onOpenChange: (open: boolean) => void
): ReactElement {
  return (
    <QueryClientProvider client={queryClient}>
      <ShortcutProvider globalHandlers={{}}>
        <ConnectEndsDialog open onOpenChange={onOpenChange} />
      </ShortcutProvider>
    </QueryClientProvider>
  );
}

function renderDialog() {
  const queryClient = createTestQueryClient();
  const onOpenChange = vi.fn<(open: boolean) => void>();
  const view = render(dialogTree(queryClient, onOpenChange));
  return { ...view, onOpenChange, queryClient };
}

function selectItem(from: string, to: string): void {
  const left = within(screen.getByRole('listbox', { name: 'Item' }));
  const right = within(screen.getByRole('listbox', { name: 'Connects to' }));
  fireEvent.click(left.getByRole('option', { name: new RegExp(from) }));
  fireEvent.click(right.getByRole('option', { name: new RegExp(to) }));
}

function connectButton(): HTMLElement {
  return screen.getByRole('button', { name: /^Connect/ });
}

function apiError(status: number, message: string): ApiError {
  return new ApiError({
    code: `test.${String(status)}`,
    kind: 'server',
    message,
    retryable: false,
    status,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  currentItemRows = itemRows();
  currentFixtures = fixtures();
  currentConnections = { rows: [], status: 'success', error: null };
  placementLoading = false;
  placementError = false;

  connectItems.mockResolvedValue(undefined);
  connectFixture.mockResolvedValue(undefined);
  mocks.useItemRows.mockImplementation(() => currentItemRows);
  mocks.useFixtures.mockImplementation(() => currentFixtures);
  mocks.useAllConnections.mockImplementation(() => currentConnections);
  mocks.useConnectionMutations.mockImplementation(() => ({ connectItems, connectFixture }));
  mocks.usePlacementSources.mockImplementation(() => ({
    world: buildWorld(currentItemRows.rows, [home, bedroom]),
    locations: [home, bedroom],
    isLoading: placementLoading,
    isError: placementError,
  }));
});

describe('ConnectEndsDialog', () => {
  it('says what will happen once both ends are chosen and connects them', async () => {
    const { onOpenChange } = renderDialog();
    selectItem('Bedside lamp', 'Soundbar');

    expect(screen.getByRole('status')).toHaveTextContent(
      'Bedside lamp will be connected to Soundbar.'
    );
    expect(connectButton()).toBeEnabled();

    fireEvent.click(connectButton());

    await waitFor(() => expect(connectItems).toHaveBeenCalledWith('lamp', 'soundbar'));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('a pair already connected is refused before sending', () => {
    currentConnections = {
      rows: [connectionRow('lamp', 'Bedside lamp', 'soundbar', 'Soundbar')],
      status: 'success',
      error: null,
    };
    renderDialog();
    const left = within(screen.getByRole('listbox', { name: 'Item' }));
    const right = within(screen.getByRole('listbox', { name: 'Connects to' }));
    fireEvent.click(left.getByRole('option', { name: /Bedside lamp/ }));

    const refused = right.getByRole('option', { name: /Soundbar/ });
    expect(refused).toHaveAttribute('aria-disabled', 'true');
    expect(refused).toHaveTextContent('Bedside lamp and Soundbar are already connected.');
    expect(connectButton()).toBeDisabled();
    expect(connectItems).not.toHaveBeenCalled();
  });

  it('a 409 shows the already-connected sentence without reading the message', async () => {
    connectItems.mockRejectedValue(apiError(409, 'some unrelated server wording'));
    const { onOpenChange } = renderDialog();
    selectItem('Bedside lamp', 'Soundbar');

    fireEvent.click(connectButton());

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(
        'Bedside lamp and Soundbar are already connected.'
      )
    );
    expect(screen.getByRole('status')).not.toHaveTextContent('some unrelated server wording');
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it('switching to fixtures clears the second choice and lists fixtures with their kind and place', () => {
    renderDialog();
    const right = within(screen.getByRole('listbox', { name: 'Connects to' }));
    fireEvent.click(right.getByRole('option', { name: /Soundbar/ }));
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Fixture' }), { button: 0 });

    expect(screen.getByRole('status')).toHaveTextContent('Choose both ends.');
    expect(right.getByRole('option', { name: /Bedside outlet/ })).toHaveTextContent(
      'Power outlet, Bedroom'
    );
  });

  it('the fixture column says it finds by name, note or wired item and sends the text as search with no type', () => {
    renderDialog();
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Fixture' }), { button: 0 });
    const search = screen.getByRole('textbox', {
      name: 'Find a fixture by name, note or wired item',
    });
    fireEvent.change(search, { target: { value: '  outlet  ' } });

    expect(mocks.useFixtures).toHaveBeenLastCalledWith({
      search: '  outlet  ',
      type: null,
      withinLocationId: null,
    });
  });

  it('Cmd-Enter connects only when the verdict is ok', async () => {
    const { onOpenChange } = renderDialog();
    fireEvent.keyDown(window, { key: 'Enter', metaKey: true });
    expect(connectItems).not.toHaveBeenCalled();

    selectItem('Bedside lamp', 'Soundbar');
    fireEvent.keyDown(window, { key: 'Enter', metaKey: true });

    await waitFor(() => expect(connectItems).toHaveBeenCalledWith('lamp', 'soundbar'));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('a failed item read shows the load failure, not Nothing matches', () => {
    const refetch = vi.fn();
    currentItemRows = itemRows({ rows: [], status: 'error', refetch });
    renderDialog();

    const left = within(screen.getByRole('listbox', { name: 'Item' }));
    expect(left.getByText('Items did not load')).toBeInTheDocument();
    expect(left.queryByText('Nothing matches.')).not.toBeInTheDocument();
    fireEvent.click(left.getByRole('button', { name: 'Retry' }));
    expect(refetch).toHaveBeenCalledOnce();
  });

  it('a failed fixture read shows the load failure and Retry refetches it', () => {
    const refetch = vi.fn();
    currentFixtures = fixtures({ rows: [], status: 'error', refetch });
    renderDialog();
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Fixture' }), { button: 0 });

    const right = within(screen.getByRole('listbox', { name: 'Connects to' }));
    expect(right.getByText('Fixtures did not load')).toBeInTheDocument();
    expect(right.queryByText('Nothing matches.')).not.toBeInTheDocument();
    fireEvent.click(right.getByRole('button', { name: 'Retry' }));
    expect(refetch).toHaveBeenCalledOnce();
  });

  it('a pending candidate read shows skeleton rows, not Nothing matches', () => {
    currentItemRows = itemRows({ rows: [], status: 'pending' });
    renderDialog();

    const left = within(screen.getByRole('listbox', { name: 'Item' }));
    expect(left.getByLabelText('Loading')).toBeInTheDocument();
    expect(left.queryByText('Nothing matches.')).not.toBeInTheDocument();
  });

  it('a pending or failed location read holds the columns and names Rooms', () => {
    placementLoading = true;
    const { queryClient, onOpenChange, rerender } = renderDialog();
    expect(screen.getAllByLabelText('Loading')).toHaveLength(2);
    expect(screen.queryByText('Nothing matches.')).not.toBeInTheDocument();

    placementLoading = false;
    placementError = true;
    rerender(dialogTree(queryClient, onOpenChange));

    expect(screen.getAllByText('Rooms did not load')).toHaveLength(2);
    expect(screen.queryByText('Nothing matches.')).not.toBeInTheDocument();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue();
    const retries = screen.getAllByRole('button', { name: 'Retry' });
    expect(retries).toHaveLength(2);
    const retry = retries.at(0);
    if (retry === undefined) throw new Error('Expected a rooms retry button');
    fireEvent.click(retry);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['inventory', 'locations', 'tree'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['inventory', 'web', 'items'] });
  });

  it('Connect stays disabled until existing connections have loaded', () => {
    currentConnections = { rows: [], status: 'pending', error: null };
    renderDialog();

    const right = within(screen.getByRole('listbox', { name: 'Connects to' }));
    expect(right.getByLabelText('Loading')).toBeInTheDocument();
    expect(connectButton()).toBeDisabled();
    expect(screen.getByRole('status')).not.toHaveTextContent('will be connected');
  });

  it('a failed existing connections read says so and Retry invalidates the connections key', () => {
    currentConnections = {
      rows: [],
      status: 'error',
      error: apiError(503, 'registry unavailable'),
    };
    const { queryClient } = renderDialog();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue();

    const right = within(screen.getByRole('listbox', { name: 'Connects to' }));
    expect(right.getByText('Existing connections did not load')).toBeInTheDocument();
    fireEvent.click(right.getByRole('button', { name: 'Retry' }));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['inventory', 'connections'] });
  });
});
