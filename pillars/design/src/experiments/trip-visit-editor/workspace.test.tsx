import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { VisitWorkspace } from './workspace';

describe('visit editing save behaviours', () => {
  it('applies direct timing edits and undoes them without changing arrangements', () => {
    render(<VisitWorkspace mode="direct" />);
    const rail = screen.getByTestId('timing-visit-curitiba');
    const before = rail.textContent;
    fireEvent.change(screen.getByLabelText('Arrival'), { target: { value: '2027-12-17' } });
    expect(rail.textContent).not.toBe(before);
    expect(screen.getByRole('region', { name: 'Visit issues' })).toHaveTextContent('Purchased');
    expect(screen.getByText('14 Dec → 18 Dec')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(rail.textContent).toBe(before);
  });
  it('keeps a draft off the route until saved and restores it with discard', () => {
    render(<VisitWorkspace mode="draft" />);
    const rail = screen.getByTestId('timing-visit-curitiba');
    const before = rail.textContent;
    fireEvent.change(screen.getByLabelText('Arrival'), { target: { value: '2027-12-10' } });
    expect(rail.textContent).toBe(before);
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(rail.textContent).not.toBe(before);
    fireEvent.change(screen.getByLabelText('Departure'), { target: { value: '2027-12-09' } });
    expect(screen.getByRole('region', { name: 'Visit issues' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
    expect(screen.getByLabelText('Departure')).toHaveValue('');
  });
  it('inserts a pending city without silently persisting it', () => {
    render(<VisitWorkspace mode="draft" />);
    fireEvent.click(screen.getByRole('button', { name: 'Add visit after São Paulo' }));
    expect(screen.getByRole('heading', { name: 'Add visit' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Add visit$/ })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
    expect(screen.getByRole('heading', { name: 'Edit visit' })).toBeInTheDocument();
  });
});
