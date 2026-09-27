import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  MovingDayDone,
  MovingDayEmpty,
  MovingDayError,
  MovingDayLoading,
} from './moving-day-states.js';
import { movingData } from './moving-day-test-fixtures.js';

describe('moving-day-states', () => {
  it('renders loading geometry with an accessible busy state', () => {
    render(<MovingDayLoading />);

    expect(screen.getByLabelText('Loading boxes')).toHaveAttribute('aria-busy', 'true');
  });

  it('provides a retry action for aggregate failures', () => {
    const onRetry = vi.fn();
    render(<MovingDayError onRetry={onRetry} />);

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('keeps the first-run action disabled while offline', () => {
    const onNewBox = vi.fn();
    render(<MovingDayEmpty looseCount={2} offline onNewBox={onNewBox} />);

    expect(
      screen.getByText('2 things are in the house. Add a box, then store things in it as you pack.')
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New box' })).toBeDisabled();
    expect(onNewBox).not.toHaveBeenCalled();
  });

  it('renders the completed move and routes missing labels', () => {
    const onPrintLabels = vi.fn();
    render(<MovingDayDone data={movingData()} onPrintLabels={onPrintLabels} />);

    expect(screen.getByText('All 3 boxes are closed')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Print 1 missing labels' }));
    expect(onPrintLabels).toHaveBeenCalledOnce();
  });
});
