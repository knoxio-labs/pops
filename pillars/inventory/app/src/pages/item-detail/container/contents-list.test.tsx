import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { buildWorld } from '../../../foundation/model/placement-model.js';
import { useSelection } from '../../../foundation/selection/use-selection.js';
import { box, inBox, item } from '../../../foundation/test-fixtures/core-factory.js';
import { ContentsList } from './contents-list.js';

import type { ReactElement } from 'react';

import type { ItemRowModel } from '../../../foundation/model/model.js';
import type { PlacementWorld } from '../../../foundation/model/placement-model.js';
import type { ContentsListProps } from './contents-list.js';

const container = box(
  ['box', 'Archive box', 'box'],
  { kind: 'location', locationId: 'room' },
  'open'
);
const rows = [
  item(['lamp', 'Desk lamp', 'lamp'], inBox(container.id), { code: 'LAMP-1' }),
  item(['cable', 'USB cable', 'cable'], inBox(container.id), { code: 'CABLE-1' }),
];
const world: PlacementWorld = buildWorld(
  [container, ...rows],
  [{ id: 'room', name: 'Study', parentId: null, kind: 'room' }]
);
const EMPTY_PENDING_IDS = new Set<string>();
const EMPTY_REJECTIONS: Readonly<Record<string, string>> = {};

function Harness({
  query,
  rows: visible,
  pendingIds = EMPTY_PENDING_IDS,
  rejections = EMPTY_REJECTIONS,
  ...rest
}: Omit<ContentsListProps, 'selection' | 'pendingIds' | 'rejections'> &
  Partial<Pick<ContentsListProps, 'pendingIds' | 'rejections'>> & {
    query: string;
    rows: readonly ItemRowModel[];
  }): ReactElement {
  const selection = useSelection(visible.map((row) => row.id));
  return (
    <ContentsList
      {...rest}
      rows={visible}
      query={query}
      selection={selection}
      pendingIds={pendingIds}
      rejections={rejections}
    />
  );
}

function renderList(query: string, visible: readonly ItemRowModel[] = rows): void {
  render(
    <Harness
      rows={visible}
      world={world}
      name={container.name}
      home="Study"
      query={query}
      refusal={null}
      onClearQuery={vi.fn()}
      onExit={vi.fn()}
      onMove={vi.fn()}
      onOpen={vi.fn()}
      onEdit={vi.fn()}
    />
  );
}

describe('ContentsList', () => {
  it('renders only direct rows supplied by the filter', () => {
    renderList('cable', [rows[1]!]);

    expect(screen.getByRole('row')).toHaveTextContent('USB cable');
    expect(screen.queryByText('Desk lamp')).not.toBeInTheDocument();
  });

  it('matches a direct row by its code', () => {
    renderList('LAMP-1', [rows[0]!]);
    expect(screen.getByRole('row')).toHaveTextContent('Desk lamp');
  });

  it('explains a filtered empty state and clears the filter', () => {
    const onClearQuery = vi.fn();
    render(
      <Harness
        rows={[]}
        world={world}
        name={container.name}
        home="Study"
        query="missing"
        refusal={null}
        onClearQuery={onClearQuery}
        onExit={vi.fn()}
      />
    );

    expect(screen.getByRole('status')).toHaveTextContent('Nothing inside matches “missing”');
    fireEvent.click(screen.getByRole('button', { name: 'Clear filter' }));
    expect(onClearQuery).toHaveBeenCalledOnce();
  });

  it('keeps row verbs visible but disabled when the container cannot change', () => {
    render(
      <Harness
        rows={[rows[0]!]}
        world={world}
        name={container.name}
        home="Study"
        query=""
        refusal="Archive box is closed. Open it to take things out."
        onClearQuery={vi.fn()}
        onExit={vi.fn()}
        onMove={vi.fn()}
      />
    );

    expect(screen.getByRole('button', { name: 'Pick up' })).toHaveAttribute(
      'aria-disabled',
      'true'
    );
    expect(screen.getByRole('button', { name: 'Move' })).toHaveAttribute('aria-disabled', 'true');
  });
});
