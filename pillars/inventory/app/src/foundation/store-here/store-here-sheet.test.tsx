import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { buildWorld } from '../model/placement-model.js';
import { kitchen13Target, office04Target, storeWorld } from '../test-fixtures/store-here';
import { storeCandidates } from './store-here-model.js';
import { StoreHereSheet } from './store-here-sheet.js';

const mocks = vi.hoisted(() => ({
  useStoreHere: vi.fn(),
  useOnline: vi.fn(),
  navigate: vi.fn(),
}));

vi.mock('./use-store-here.js', () => ({ useStoreHere: mocks.useStoreHere }));
vi.mock('../../inventory-web/useOnline.js', () => ({ useOnline: mocks.useOnline }));
vi.mock('react-router', () => ({ useNavigate: () => mocks.navigate }));

describe('StoreHereSheet', () => {
  function dataFor(target = kitchen13Target) {
    const sourceTarget =
      storeWorld.items.get(target.id) ?? storeWorld.items.get(kitchen13Target.id);
    const world =
      sourceTarget === undefined
        ? storeWorld
        : buildWorld(
            [...storeWorld.items.values(), { ...sourceTarget, id: target.id, name: target.name }],
            [...storeWorld.locations.values()]
          );
    return {
      status: 'success' as const,
      retry: vi.fn(),
      world,
      candidates: storeCandidates(world, target, ''),
      query: '',
      setQuery: vi.fn(),
      selected: new Set<string>(),
      toggle: vi.fn(),
      created: [],
      create: vi.fn().mockResolvedValue(true),
      createError: null,
      busy: false,
      store: vi.fn().mockResolvedValue(undefined),
      openTarget: vi.fn().mockResolvedValue(undefined),
    };
  }

  beforeEach(() => {
    mocks.useStoreHere.mockReset();
    mocks.useOnline.mockReset();
    mocks.navigate.mockReset();
    mocks.useOnline.mockReturnValue(true);
    mocks.useStoreHere.mockImplementation((target) => dataFor(target));
  });

  it('renders nothing and fetches nothing while closed', () => {
    render(<StoreHereSheet open={false} onOpenChange={vi.fn()} target={kitchen13Target} />);

    expect(mocks.useStoreHere).not.toHaveBeenCalled();
    expect(mocks.useOnline).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('creates a named item and opens the full form with an encoded target id', async () => {
    const data = dataFor({ ...kitchen13Target, id: 'box/1 ?&' });
    mocks.useStoreHere.mockReturnValue(data);
    render(
      <StoreHereSheet open onOpenChange={vi.fn()} target={{ ...kitchen13Target, id: 'box/1 ?&' }} />
    );

    const input = screen.getByRole('textbox', { name: 'Name of the new item in Kitchen 13' });
    fireEvent.change(input, { target: { value: 'New item' } });

    expect(screen.getByRole('button', { name: 'Create' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    expect(data.create).toHaveBeenCalledWith('New item');

    fireEvent.click(screen.getByRole('button', { name: 'Open the full form for Kitchen 13' }));
    expect(mocks.navigate).toHaveBeenCalledWith('/inventory/items/new?in=box%2F1%20%3F%26');
  });

  it('disables mutations offline but lets a closed target attempt to open', () => {
    const data = dataFor(office04Target);
    data.selected = new Set(['itm-tape']);
    mocks.useStoreHere.mockReturnValue(data);
    mocks.useOnline.mockReturnValue(false);
    render(<StoreHereSheet open onOpenChange={vi.fn()} target={office04Target} />);

    expect(screen.getByRole('button', { name: 'Create' })).toBeDisabled();
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Existing items' }), { button: 0 });
    expect(screen.getByRole('button', { name: 'Store 1 item' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Open Office 04' }));
    expect(data.openTarget).toHaveBeenCalledOnce();
  });
});
