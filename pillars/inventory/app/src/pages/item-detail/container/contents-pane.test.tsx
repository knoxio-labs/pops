import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { buildWorld } from '../../../foundation/model/placement-model.js';
import { box, inBox, item } from '../../../foundation/test-fixtures/core-factory.js';
import { ContentsPane } from './contents-pane.js';
import { initialUnpack } from './unpack-model.js';

const container = box(
  ['box', 'Archive box', 'box'],
  { kind: 'location', locationId: 'room' },
  'open'
);
const rows = [
  item(['cable', 'USB cable', 'cable'], inBox(container.id), { code: 'CABLE-1' }),
  item(['lamp', 'Desk lamp', 'lamp'], inBox(container.id), { code: 'LAMP-1' }),
];
const world = buildWorld(
  [container, ...rows],
  [{ id: 'room', name: 'Study', parentId: null, kind: 'room' }]
);

function renderPane() {
  return render(
    <ContentsPane
      name={container.name}
      home="Study"
      world={world}
      inside={rows.map((row) => row.id)}
      contentCounts={{}}
      state={initialUnpack(
        rows.map((row) => row.id),
        'open'
      )}
      dispatch={vi.fn()}
      readOnly={false}
      pendingIds={new Set()}
      rejections={{}}
      onExit={vi.fn()}
      onMove={vi.fn()}
      onLabel={vi.fn()}
      onLifecycle={vi.fn()}
      onStoreHere={vi.fn()}
      onOpen={vi.fn()}
      onEdit={vi.fn()}
      onOpenContainer={vi.fn()}
      onRetire={vi.fn()}
    />
  );
}

describe('ContentsPane', () => {
  it('sorts direct contents by name by default', () => {
    renderPane();

    expect(
      screen.getAllByRole('button', { name: /^Open / }).map((button) => button.textContent)
    ).toEqual(['Desk lamp', 'USB cable']);
  });

  it('changes the contents order from the sort menu', async () => {
    const user = userEvent.setup();
    renderPane();

    await user.click(screen.getByRole('button', { name: 'Sort contents' }));
    await user.click(screen.getByRole('menuitemradio', { name: 'Name (Z–A)' }));

    expect(
      screen.getAllByRole('button', { name: /^Open / }).map((button) => button.textContent)
    ).toEqual(['USB cable', 'Desk lamp']);
  });

  it('filters direct contents by name and code without changing the unpack state', () => {
    renderPane();
    const filter = screen.getByRole('textbox', { name: 'Filter what is in Archive box' });

    fireEvent.change(filter, { target: { value: 'cable' } });

    expect(screen.getByRole('row')).toHaveTextContent('USB cable');
    expect(screen.queryByText('Desk lamp')).not.toBeInTheDocument();
    expect(screen.getByText('2 directly inside')).toBeInTheDocument();
  });
});
