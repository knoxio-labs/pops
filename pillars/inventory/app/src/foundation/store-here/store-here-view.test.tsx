import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  kitchen13Target,
  linen02Target,
  multiPick,
  office04Target,
  storeWorld,
} from '../test-fixtures/store-here';
import { storeCandidates } from './store-here-model';
import { StoreHereSheetPanel } from './store-here-view';

import type { ItemRowModel } from '../model/model';
import type { StoreHereViewProps } from './store-here-view';

function viewProps(overrides: Partial<StoreHereViewProps> = {}): StoreHereViewProps {
  const target = overrides.target ?? kitchen13Target;
  const query = overrides.query ?? '';
  return {
    target,
    world: storeWorld,
    status: 'success',
    onRetry: vi.fn(),
    candidates: storeCandidates(storeWorld, target, query),
    initialTab: 'new',
    query,
    onQuery: vi.fn(),
    selected: new Set<string>(),
    onToggle: vi.fn(),
    created: [],
    onCreate: vi.fn<(name: string) => Promise<boolean>>().mockResolvedValue(true),
    createError: null,
    onStoreExisting: vi.fn<(items: readonly ItemRowModel[]) => void>(),
    onOpenTarget: vi.fn(),
    onOpenForm: vi.fn(),
    onDone: vi.fn(),
    offline: false,
    busy: false,
    ...overrides,
  };
}

function renderView(overrides: Partial<StoreHereViewProps> = {}) {
  return render(<StoreHereSheetPanel {...viewProps(overrides)} />);
}

function showTab(name: 'New item' | 'Existing items'): void {
  fireEvent.mouseDown(screen.getByRole('tab', { name }), { button: 0 });
}

describe('StoreHereSheetPanel', () => {
  it('Store passes the plan’s moving items and the button counts them', () => {
    const onStoreExisting = vi.fn<(items: readonly ItemRowModel[]) => void>();
    renderView({
      initialTab: 'existing',
      selected: new Set(multiPick),
      onStoreExisting,
    });

    expect(screen.getByRole('button', { name: 'Store 3 items' })).toBeEnabled();
    expect(screen.getByText('Their contents move too: 1 more item.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Store 3 items' }));

    expect(onStoreExisting).toHaveBeenCalledOnce();
    expect(onStoreExisting.mock.calls[0]?.[0].map((item) => item.id)).toEqual(multiPick);
  });

  it('a closed target disables Create and Store and Open calls onOpenTarget', () => {
    const onOpenTarget = vi.fn();
    renderView({
      target: office04Target,
      initialTab: 'existing',
      selected: new Set(['itm-toaster']),
      onOpenTarget,
    });

    expect(screen.getByRole('button', { name: 'Store 1 item' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Open Office 04' }));
    expect(onOpenTarget).toHaveBeenCalledOnce();

    showTab('New item');
    expect(
      screen.getByRole('textbox', { name: 'Name of the new item in Office 04' })
    ).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Create' })).toBeDisabled();
  });

  it('a full target warns and leaves Store enabled', () => {
    renderView({
      target: linen02Target,
      initialTab: 'existing',
      selected: new Set(['itm-sheets']),
    });

    expect(
      screen.getByText('Linen 02 is marked full. Storing more keeps the mark.')
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Store 1 item' })).toBeEnabled();
  });

  it('Enter in the New tab calls onCreate with the trimmed name and clears it only when it resolves true', async () => {
    const onCreate = vi
      .fn<(name: string) => Promise<boolean>>()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    renderView({ onCreate });

    const input = screen.getByRole('textbox', { name: 'Name of the new item in Kitchen 13' });
    fireEvent.change(input, { target: { value: '  Tea towels  ' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(onCreate).toHaveBeenCalledWith('Tea towels'));
    expect(input).toHaveValue('  Tea towels  ');

    fireEvent.change(input, { target: { value: '  Milk frother  ' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(input).toHaveValue(''));
    expect(onCreate).toHaveBeenCalledWith('Milk frother');
  });

  it('busy disables Create and Store and leaves the name field enabled', () => {
    renderView({ busy: true, selected: new Set(multiPick) });

    const input = screen.getByRole('textbox', { name: 'Name of the new item in Kitchen 13' });
    expect(input).toBeEnabled();
    fireEvent.change(input, { target: { value: 'New item' } });
    expect(screen.getByRole('button', { name: 'Create' })).toBeDisabled();

    showTab('Existing items');
    expect(screen.getByRole('button', { name: 'Store 3 items' })).toBeDisabled();
  });

  it('offline disables Create, the search and Store and leaves unrefused ticks enabled', () => {
    renderView({
      initialTab: 'existing',
      selected: new Set(['itm-tape']),
      offline: true,
    });

    expect(
      screen.getByRole('textbox', { name: 'Search items by name, code, type or place' })
    ).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: 'Store Tape measure' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Store 1 item' })).toBeDisabled();

    showTab('New item');
    expect(
      screen.getByRole('textbox', { name: 'Name of the new item in Kitchen 13' })
    ).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Create' })).toBeDisabled();
  });

  it('pending shows skeleton rows and disables Create and Store', () => {
    renderView({
      initialTab: 'existing',
      status: 'pending',
      selected: new Set(multiPick),
    });

    expect(document.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(3);
    expect(screen.getByRole('button', { name: 'Store 3 items' })).toBeDisabled();

    showTab('New item');
    expect(screen.getByRole('button', { name: 'Create' })).toBeDisabled();
  });

  it('pending keeps the search field and drops the note', () => {
    renderView({ initialTab: 'existing', status: 'pending' });

    expect(
      screen.getByRole('textbox', { name: 'Search items by name, code, type or place' })
    ).toBeInTheDocument();
    expect(
      screen.queryByText('In hand first, then everything else by name.')
    ).not.toBeInTheDocument();
  });

  it('a refused target stays disabled while reads are pending', () => {
    renderView({ target: office04Target, initialTab: 'existing', status: 'pending' });

    expect(
      screen.getByRole('textbox', { name: 'Search items by name, code, type or place' })
    ).toBeDisabled();
  });

  it('error shows Could not load items. and Retry calls onRetry', () => {
    const onRetry = vi.fn();
    renderView({ initialTab: 'existing', status: 'error', onRetry });

    expect(screen.getByRole('alert')).toHaveTextContent('Could not load items.');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('error shows no note, list or No active item matches line', () => {
    renderView({
      initialTab: 'existing',
      status: 'error',
      query: 'snorkel',
    });

    expect(
      screen.queryByText('In hand first, then everything else by name.')
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Items to store' })).not.toBeInTheDocument();
    expect(screen.queryByText(/No active item matches/)).not.toBeInTheDocument();
  });

  it('Open the full form calls onOpenForm', () => {
    const onOpenForm = vi.fn();
    renderView({ onOpenForm });

    fireEvent.click(screen.getByRole('button', { name: 'Open the full form for Kitchen 13' }));
    expect(onOpenForm).toHaveBeenCalledOnce();
  });

  it('resets the tab and draft name when the target changes', async () => {
    const { rerender } = renderView({ initialTab: 'existing' });
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'New item' }), { button: 0 });
    fireEvent.change(screen.getByRole('textbox', { name: 'Name of the new item in Kitchen 13' }), {
      target: { value: 'Draft name' },
    });

    rerender(
      <StoreHereSheetPanel {...viewProps({ target: office04Target, initialTab: 'existing' })} />
    );

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'Existing items' })).toHaveAttribute(
        'data-state',
        'active'
      );
    });

    showTab('New item');
    expect(screen.getByRole('textbox', { name: 'Name of the new item in Office 04' })).toHaveValue(
      ''
    );
  });

  it('renders duplicate created names without duplicate key warnings', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    try {
      renderView({ created: ['Tape measure', 'Tape measure'] });

      expect(screen.getAllByText('Tape measure')).toHaveLength(2);
      expect(consoleError.mock.calls.flat().join(' ')).not.toContain('unique "key" prop');
    } finally {
      consoleError.mockRestore();
    }
  });

  it('reports search changes and disables only refused rows', () => {
    const onQuery = vi.fn();
    renderView({ initialTab: 'existing', target: office04Target, onQuery });

    fireEvent.change(
      screen.getByRole('textbox', { name: 'Search items by name, code, type or place' }),
      { target: { value: 'lamp' } }
    );
    expect(onQuery).toHaveBeenCalledWith('lamp');
    expect(screen.getByRole('checkbox', { name: 'Store Monitor 27 in' })).toBeDisabled();
    expect(screen.getByText('Office 04 is closed. Open it first.')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Store Tape measure' })).toBeEnabled();
  });
});
