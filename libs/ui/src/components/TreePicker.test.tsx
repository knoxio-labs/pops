import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { TreePicker } from './TreePicker';

import type { TreeNode } from './TreeView';

interface LocationData {
  name: string;
}

function node(
  id: string,
  name: string,
  children: TreeNode<LocationData>[] = []
): TreeNode<LocationData> {
  return { id, data: { name }, children };
}

const LOCATIONS: TreeNode<LocationData>[] = [
  node('home', 'Home', [node('bedroom', 'Bedroom'), node('kitchen', 'Kitchen')]),
  node('storage-unit', 'Storage Unit'),
];

async function openPicker() {
  await userEvent.click(screen.getByRole('button', { name: 'Select…' }));
  return screen.getByPlaceholderText('Search…');
}

describe('TreePicker — selection', () => {
  it('reports the picked node and closes the popover', async () => {
    const onSelect = vi.fn();
    render(<TreePicker nodes={LOCATIONS} getLabel={(d) => d.name} onSelect={onSelect} />);

    await openPicker();
    await userEvent.click(screen.getByText('Home'));

    expect(onSelect).toHaveBeenCalledExactlyOnceWith(LOCATIONS[0]);
    expect(screen.queryByPlaceholderText('Search…')).not.toBeInTheDocument();
  });
});

describe('TreePicker — footer clear row', () => {
  it('is absent unless onClear is supplied, even with a selection', async () => {
    render(
      <TreePicker
        nodes={LOCATIONS}
        getLabel={(d) => d.name}
        selectedId="bedroom"
        onSelect={vi.fn()}
      />
    );
    await openPicker();
    expect(screen.queryByText('Clear selection')).not.toBeInTheDocument();
  });

  it('is absent when onClear is supplied but nothing is selected', async () => {
    render(
      <TreePicker nodes={LOCATIONS} getLabel={(d) => d.name} onSelect={vi.fn()} onClear={vi.fn()} />
    );
    await openPicker();
    expect(screen.queryByText('Clear selection')).not.toBeInTheDocument();
  });

  it('returns the value to empty and fires onClear when a selection exists', async () => {
    const onClear = vi.fn();
    const onSelect = vi.fn();
    render(
      <TreePicker
        nodes={LOCATIONS}
        getLabel={(d) => d.name}
        selectedId="bedroom"
        onSelect={onSelect}
        onClear={onClear}
      />
    );

    await openPicker();
    await userEvent.click(screen.getByText('Clear selection'));

    expect(onClear).toHaveBeenCalledOnce();
    expect(onSelect).not.toHaveBeenCalled();
  });
});

describe('TreePicker — footer create row', () => {
  it('is absent unless onCreate is supplied', async () => {
    render(<TreePicker nodes={LOCATIONS} getLabel={(d) => d.name} onSelect={vi.fn()} />);
    await openPicker();
    expect(screen.queryByText('Create new')).not.toBeInTheDocument();
  });

  it('is reachable with an empty search query, unlike the no-matches flow', async () => {
    const onCreate = vi.fn();
    render(
      <TreePicker
        nodes={LOCATIONS}
        getLabel={(d) => d.name}
        onSelect={vi.fn()}
        onCreate={onCreate}
      />
    );

    await openPicker();
    expect(screen.getByText('Create new')).toBeInTheDocument();

    await userEvent.click(screen.getByText('Create new'));
    const nameField = screen.getByPlaceholderText('Create new…');
    await userEvent.type(nameField, 'Garage{Enter}');

    expect(onCreate).toHaveBeenCalledExactlyOnceWith('Garage', null);
  });

  it('stays reachable while a query that matches an existing node is typed', async () => {
    const onCreate = vi.fn();
    render(
      <TreePicker
        nodes={LOCATIONS}
        getLabel={(d) => d.name}
        onSelect={vi.fn()}
        onCreate={onCreate}
      />
    );

    const search = await openPicker();
    await userEvent.type(search, 'Home');
    expect(screen.getByText('Home')).toBeInTheDocument();

    await userEvent.click(screen.getByText('Create new'));
    const nameField = screen.getByPlaceholderText('Create new…');
    await userEvent.type(nameField, 'Garage{Enter}');

    expect(onCreate).toHaveBeenCalledExactlyOnceWith('Garage', null);
  });

  it('respects a custom createLabel', async () => {
    render(
      <TreePicker
        nodes={LOCATIONS}
        getLabel={(d) => d.name}
        onSelect={vi.fn()}
        onCreate={vi.fn()}
        createLabel="Add location"
      />
    );
    await openPicker();
    expect(screen.getByText('Add location')).toBeInTheDocument();
  });

  it('leaves the search-driven no-matches create flow working alongside the footer row', async () => {
    const onCreate = vi.fn();
    render(
      <TreePicker
        nodes={LOCATIONS}
        getLabel={(d) => d.name}
        onSelect={vi.fn()}
        onCreate={onCreate}
      />
    );

    const search = await openPicker();
    await userEvent.type(search, 'Garage');

    expect(screen.getByText('No matches for “Garage”')).toBeInTheDocument();
    await userEvent.click(screen.getByText('Create “Garage”'));

    expect(onCreate).toHaveBeenCalledExactlyOnceWith('Garage', null);
  });
});
