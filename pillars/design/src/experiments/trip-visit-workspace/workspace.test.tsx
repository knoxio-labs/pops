import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { VisitWorkspace } from './workspace';

function chooseDay(day: string) {
  fireEvent.click(screen.getByRole('button', { name: 'Day' }));
  fireEvent.input(screen.getByLabelText('Selected day'), { target: { value: day } });
}

describe('visit workspace', () => {
  it('edits stay coverage across projections and restores it with undo', () => {
    render(<VisitWorkspace layout="periods" />);
    expect(screen.getByRole('button', { name: 'Add accommodation' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Edit accommodation Hotel da Praça' }));
    fireEvent.input(screen.getByLabelText('Check-out'), { target: { value: '2028-01-06' } });
    expect(screen.queryByRole('button', { name: 'Add accommodation' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Check-out')).toHaveValue('2028-01-06');
    fireEvent.keyDown(screen.getByLabelText('Check-out'), { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(screen.getByRole('button', { name: 'Add accommodation' })).toBeInTheDocument();
  });

  it('focuses the hotel-change day with local clocks and the person record', () => {
    render(<VisitWorkspace layout="periods" />);
    chooseDay('2028-01-03');
    expect(screen.getByText('11:00')).toBeInTheDocument();
    expect(screen.getByText('14:00')).toBeInTheDocument();
    expect(screen.getByText('18:00')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Marina')).toBeInTheDocument();
    expect(screen.queryByDisplayValue('Concert')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Whole visit' }));
    expect(screen.getByDisplayValue('Concert')).toBeInTheDocument();
  });

  it('captures a day activity with the selected date and preserves it in the visit', () => {
    render(<VisitWorkspace layout="periods" />);
    chooseDay('2028-01-05');
    fireEvent.click(screen.getByRole('button', { name: 'Add activity on 5 Jan' }));
    fireEvent.change(screen.getByPlaceholderText('Name'), { target: { value: 'Beach' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(screen.getByDisplayValue('Beach')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Whole visit' }));
    expect(screen.getByDisplayValue('Beach')).toBeInTheDocument();
  });

  it('keeps an empty visit editable with one accommodation slot', () => {
    render(<VisitWorkspace layout="periods" scenario="empty" />);
    expect(screen.getAllByRole('button', { name: 'Add accommodation' })).toHaveLength(1);
    expect(screen.queryByDisplayValue('Marina')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add to visit' })).toBeInTheDocument();
  });

  it('shows overlap warnings without discarding either stay', () => {
    render(<VisitWorkspace layout="periods" scenario="overlap" />);
    expect(screen.getAllByText('Check overlapping accommodation')).toHaveLength(1);
    expect(
      screen.getAllByRole('button', { name: 'Edit accommodation Pousada do Largo' }).length
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByRole('button', { name: 'Edit accommodation Hotel da Praça' }).length
    ).toBeGreaterThan(0);
  });

  it('keeps repeated visits separate when choosing a city visit', () => {
    render(<VisitWorkspace layout="periods" scenario="repeat-visit" />);
    fireEvent.click(screen.getByRole('button', { name: 'Choose visit' }));
    fireEvent.click(screen.getByRole('button', { name: /Recife \/ Olinda.*20 Jan/ }));
    expect(screen.queryByDisplayValue('Marina')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit timing' })).toHaveTextContent('20 Jan');
  });

  it('shows undated ideas once in the day-grouped proposal', () => {
    render(<VisitWorkspace layout="days" />);
    expect(
      within(screen.getByRole('region', { name: 'Undated items' })).getByDisplayValue(
        'Walk in the old town'
      )
    ).toBeInTheDocument();
    expect(screen.getAllByDisplayValue('Walk in the old town')).toHaveLength(1);
  });
  it('captures a person as a typed visit item without requiring dates', () => {
    render(<VisitWorkspace layout="periods" />);
    fireEvent.click(screen.getByRole('button', { name: 'Add to visit' }));
    fireEvent.click(screen.getByRole('button', { name: 'Person' }));
    fireEvent.change(screen.getByPlaceholderText('Name'), { target: { value: 'Alex' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(screen.getByDisplayValue('Alex')).toHaveAttribute('aria-label', 'Person name');
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(screen.queryByDisplayValue('Alex')).not.toBeInTheDocument();
  });
  it('retains the departure transport gap in the day-first proposal', () => {
    render(<VisitWorkspace layout="days" />);
    const departure = screen.getByRole('region', { name: '2028-01-06' });
    expect(
      within(departure).getByRole('button', { name: 'Add departure transport' })
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add arrival transport' })).not.toBeInTheDocument();
  });
  it('does not create an undo step for leaving an unchanged activity title', () => {
    render(<VisitWorkspace layout="periods" />);
    fireEvent.focus(screen.getByDisplayValue('Marina'));
    fireEvent.blur(screen.getByDisplayValue('Marina'));
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
  });
});
