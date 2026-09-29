import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { buildWorld } from '../../foundation/model/placement-model.js';
import { DestinationBoard, FindResults, LooseBoard, StageBoard } from './moving-day-board.js';
import { box, movingData, worldForMovingData } from './moving-day-test-fixtures.js';

function boardProps() {
  const data = movingData();
  return {
    data,
    world: worldForMovingData(data),
    selectedId: null,
    pendingIds: new Set<string>(),
    disabledReason: undefined,
    rejections: {},
    onAction: vi.fn(),
    onOpenBox: vi.fn(),
  };
}

describe('moving-day-board', () => {
  it('renders all stage columns and sends a typed action for a card', () => {
    const props = boardProps();
    render(<StageBoard {...props} />);

    expect(screen.getByRole('region', { name: 'Packing' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Full, not closed' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Closed' })).toBeInTheDocument();
    expect(screen.getByText('Box 2')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Mark full' }));
    expect(props.onAction).toHaveBeenCalledWith(props.data.boxes[0], 'mark-full');
  });

  it('shows closed unlabelled boxes as needing a label', () => {
    render(<StageBoard {...boardProps()} />);

    expect(screen.getByText('No label')).toBeInTheDocument();
  });

  it('renders configured destination columns, including an empty one', () => {
    const props = boardProps();
    const data = movingData({ boxes: [box('box', 'Box', 'packing')] });
    render(<DestinationBoard {...props} data={data} />);

    expect(screen.getByRole('region', { name: 'Storage unit' })).toBeInTheDocument();
    expect(screen.getAllByText('No box assigned.')).toHaveLength(2);
    expect(screen.getByRole('region', { name: 'No destination' })).toBeInTheDocument();
  });

  it('packs all loose things in a room and disables writes when offline', () => {
    const props = boardProps();
    const onPack = vi.fn();
    render(
      <LooseBoard data={props.data} disabledReason={undefined} rejections={{}} onPack={onPack} />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Pack all 2' }));
    expect(onPack).toHaveBeenCalledWith(['item-plant', 'item-mug']);

    render(
      <LooseBoard
        data={props.data}
        disabledReason="No connection"
        rejections={{}}
        onPack={onPack}
      />
    );
    expect(screen.getAllByRole('button', { name: 'Pack all 2' })[1]).toBeDisabled();
  });

  it('renders a search result and a clearable no-result state', () => {
    const data = movingData({
      boxes: [
        box('box', 'Kitchen', 'packing', {
          contents: [
            {
              id: 'kettle',
              name: 'Kettle',
              code: null,
              quantity: 1,
              containerId: 'box',
            },
          ],
          count: 1,
        }),
      ],
    });
    const props = {
      data,
      world: buildWorld([], []),
      view: 'stage' as const,
      query: 'kettle',
      selectedId: null,
      pendingIds: new Set<string>(),
      disabledReason: undefined,
      rejections: {},
      onAction: vi.fn(),
      onOpenBox: vi.fn(),
      onPack: vi.fn(),
      onClearSearch: vi.fn(),
    };

    render(<FindResults {...props} onClear={props.onClearSearch} />);
    expect(screen.getByText('1 thing in 1 box')).toBeInTheDocument();
    expect(screen.getByText('Kettle')).toBeInTheDocument();

    render(<FindResults {...props} query="unknown" onClear={props.onClearSearch} />);
    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(props.onClearSearch).toHaveBeenCalledOnce();
  });
});
