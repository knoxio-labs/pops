import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { LocationPicker, type LocationTreeNode } from './LocationPicker';

// --- Test data ---

const LOCATIONS: LocationTreeNode[] = [
  {
    id: 'home',
    name: 'Home',
    parentId: null,
    children: [
      {
        id: 'bedroom',
        name: 'Bedroom',
        parentId: 'home',
        children: [{ id: 'wardrobe', name: 'Wardrobe', parentId: 'bedroom', children: [] }],
      },
      { id: 'kitchen', name: 'Kitchen', parentId: 'home', children: [] },
    ],
  },
  {
    id: 'office',
    name: 'Office',
    parentId: null,
    children: [{ id: 'desk', name: 'Desk', parentId: 'office', children: [] }],
  },
];

function openPicker(name: RegExp | string) {
  fireEvent.click(screen.getByRole('button', { name }));
}

function rowByLabel(label: string) {
  return screen.getByText(label).closest('[role="treeitem"]') as HTMLElement;
}

function focusRow(label: string) {
  act(() => {
    rowByLabel(label).focus();
  });
}

function press(label: string, key: string) {
  fireEvent.keyDown(rowByLabel(label), { key });
}

// --- Tests ---

describe('LocationPicker — trigger', () => {
  it('shows the placeholder when nothing is selected', () => {
    render(<LocationPicker locations={LOCATIONS} value={null} />);
    expect(screen.getByText('Select location…')).toBeInTheDocument();
  });

  it('shows a custom placeholder', () => {
    render(<LocationPicker locations={LOCATIONS} value={null} placeholder="Pick a room" />);
    expect(screen.getByText('Pick a room')).toBeInTheDocument();
  });

  it('shows the ancestor breadcrumb when a nested location is selected', () => {
    render(<LocationPicker locations={LOCATIONS} value="wardrobe" />);
    expect(screen.getByText('Home › Bedroom › Wardrobe')).toBeInTheDocument();
  });

  it('shows just the name for a root-level selection', () => {
    render(<LocationPicker locations={LOCATIONS} value="office" />);
    expect(screen.getByText('Office')).toBeInTheDocument();
  });

  it('is disabled when the disabled prop is set', () => {
    render(<LocationPicker locations={LOCATIONS} value={null} disabled />);
    expect(screen.getByRole('button', { name: 'Select location…' })).toBeDisabled();
  });
});

describe('LocationPicker — keyboard-only selection', () => {
  it('exposes an ARIA tree a keyboard user can traverse, expand, and select from', () => {
    const onChange = vi.fn();
    render(<LocationPicker locations={LOCATIONS} value={null} onChange={onChange} />);

    openPicker('Select location…');
    expect(screen.getByRole('tree')).toBeInTheDocument();

    // Roots start collapsed — Bedroom/Wardrobe are not reachable yet.
    expect(screen.queryByText('Wardrobe')).not.toBeInTheDocument();

    focusRow('Home');
    expect(rowByLabel('Home')).toHaveAttribute('aria-expanded', 'false');

    // Expand Home with ArrowRight — no click, no pointer, anywhere below.
    press('Home', 'ArrowRight');
    expect(rowByLabel('Home')).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Bedroom')).toBeInTheDocument();

    // Roving focus moves down onto the newly-revealed child.
    press('Home', 'ArrowDown');
    expect(rowByLabel('Bedroom')).toHaveFocus();

    // Expand Bedroom to reveal the deeply nested target.
    press('Bedroom', 'ArrowRight');
    expect(screen.getByText('Wardrobe')).toBeInTheDocument();

    press('Bedroom', 'ArrowDown');
    expect(rowByLabel('Wardrobe')).toHaveFocus();
    expect(rowByLabel('Wardrobe')).toHaveAttribute('aria-selected', 'false');

    // Select with Enter.
    press('Wardrobe', 'Enter');

    expect(onChange).toHaveBeenCalledExactlyOnceWith('wardrobe');
    expect(screen.queryByRole('tree')).not.toBeInTheDocument();
  });

  it('marks the currently selected node aria-selected once reachable', () => {
    render(<LocationPicker locations={LOCATIONS} value="bedroom" onChange={vi.fn()} />);

    openPicker(/Home › Bedroom/);
    focusRow('Home');
    press('Home', 'ArrowRight');

    expect(rowByLabel('Bedroom')).toHaveAttribute('aria-selected', 'true');
  });
});

describe('LocationPicker — search', () => {
  it('filters to matching nodes and auto-expands their ancestors', () => {
    render(<LocationPicker locations={LOCATIONS} value={null} onChange={vi.fn()} />);

    openPicker('Select location…');
    const search = screen.getByPlaceholderText('Search locations…');
    fireEvent.change(search, { target: { value: 'wardrobe' } });

    expect(screen.getByText('Wardrobe')).toBeInTheDocument();
    expect(screen.getByText('Bedroom')).toBeInTheDocument();
    expect(screen.getByText('Home')).toBeInTheDocument();
    expect(screen.queryByText('Office')).not.toBeInTheDocument();
  });

  it('hides non-matching branches entirely', () => {
    render(<LocationPicker locations={LOCATIONS} value={null} onChange={vi.fn()} />);

    openPicker('Select location…');
    const search = screen.getByPlaceholderText('Search locations…');
    fireEvent.change(search, { target: { value: 'kitchen' } });

    expect(screen.getByText('Kitchen')).toBeInTheDocument();
    expect(screen.getByText('Home')).toBeInTheDocument();
    expect(screen.queryByText('Office')).not.toBeInTheDocument();
    expect(screen.queryByText('Bedroom')).not.toBeInTheDocument();
  });
});

describe('LocationPicker — clear', () => {
  it('shows a clear row once a location is selected and returns the value to empty', () => {
    const onChange = vi.fn();
    render(<LocationPicker locations={LOCATIONS} value="home" onChange={onChange} />);

    openPicker('Home');
    fireEvent.click(screen.getByText('Clear selection'));

    expect(onChange).toHaveBeenCalledExactlyOnceWith(null);
  });

  it('does not offer a clear row when nothing is selected', () => {
    render(<LocationPicker locations={LOCATIONS} value={null} onChange={vi.fn()} />);
    openPicker('Select location…');
    expect(screen.queryByText('Clear selection')).not.toBeInTheDocument();
  });
});

describe('LocationPicker — create', () => {
  it('is reachable from the footer without a matching (or any) search query', () => {
    const onCreateLocation = vi.fn();
    render(
      <LocationPicker
        locations={LOCATIONS}
        value={null}
        onChange={vi.fn()}
        onCreateLocation={onCreateLocation}
      />
    );

    openPicker('Select location…');
    expect(screen.getByText('Add location')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Add location'));
    const nameField = screen.getByPlaceholderText('Add location…');
    fireEvent.change(nameField, { target: { value: 'Garage' } });
    fireEvent.keyDown(nameField, { key: 'Enter' });

    expect(onCreateLocation).toHaveBeenCalledExactlyOnceWith('Garage', null);
  });

  it('parents the created location under the currently selected node', () => {
    const onCreateLocation = vi.fn();
    render(
      <LocationPicker
        locations={LOCATIONS}
        value="bedroom"
        onChange={vi.fn()}
        onCreateLocation={onCreateLocation}
      />
    );

    openPicker(/Home › Bedroom/);
    fireEvent.click(screen.getByText('Add location'));
    const nameField = screen.getByPlaceholderText('Add location…');
    fireEvent.change(nameField, { target: { value: 'Closet' } });
    fireEvent.keyDown(nameField, { key: 'Enter' });

    expect(onCreateLocation).toHaveBeenCalledExactlyOnceWith('Closet', 'bedroom');
  });

  it('does not show a create row without onCreateLocation', () => {
    render(<LocationPicker locations={LOCATIONS} value={null} onChange={vi.fn()} />);
    openPicker('Select location…');
    expect(screen.queryByText('Add location')).not.toBeInTheDocument();
  });
});

describe('LocationPicker — empty tree', () => {
  it('shows the search box with no rows and no crash', () => {
    render(<LocationPicker locations={[]} value={null} onChange={vi.fn()} />);
    openPicker('Select location…');
    expect(screen.getByPlaceholderText('Search locations…')).toBeInTheDocument();
    expect(screen.queryAllByRole('treeitem')).toHaveLength(0);
  });
});
