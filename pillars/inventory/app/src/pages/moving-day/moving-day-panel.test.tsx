import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { MovingDayPanel } from './moving-day-panel.js';
import { movingData, worldForMovingData } from './moving-day-test-fixtures.js';

function panelProps() {
  const data = movingData();
  return {
    data,
    world: worldForMovingData(data),
    box: data.boxes[0]!,
    pendingIds: new Set<string>(),
    disabledReason: undefined,
    rejections: {},
    onAction: vi.fn(),
    onPutIn: vi.fn(),
    onClose: vi.fn(),
  };
}

describe('moving-day-panel', () => {
  it('shows box contents and lets an open box accept a loose item', () => {
    const props = panelProps();
    render(<MovingDayPanel {...props} />);

    expect(screen.getByRole('heading', { name: 'In it, 1' })).toBeInTheDocument();
    expect(screen.getByText('Kettle')).toBeInTheDocument();
    expect(screen.getByText('Still loose in Kitchen, 2')).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: 'Put in' })[0]!);
    expect(props.onPutIn).toHaveBeenCalledWith(['item-plant']);
    fireEvent.click(screen.getByRole('button', { name: 'Close box' }));
    expect(props.onAction).toHaveBeenCalledWith(props.box, 'close');
  });

  it('explains why a closed box cannot accept more things', () => {
    const data = movingData();
    const props = {
      ...panelProps(),
      data,
      world: worldForMovingData(data),
      box: data.boxes[2]!,
    };
    render(<MovingDayPanel {...props} />);

    expect(screen.getByText('Reopen the box to put more in.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Put in' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reopen' })).toBeInTheDocument();
  });

  it('shows a refusal beside the affected loose item', () => {
    const props = panelProps();
    const withRejection = { ...props, rejections: { 'item-plant': 'Box is already closed' } };
    render(<MovingDayPanel {...withRejection} />);

    expect(screen.getByRole('alert')).toHaveTextContent('Box is already closed');
  });
});
