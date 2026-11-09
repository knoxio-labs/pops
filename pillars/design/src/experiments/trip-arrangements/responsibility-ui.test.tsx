import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { createArrangementState } from './fixture';
import { arrangementRows } from './model';
import { ArrangementsWorkspace } from './workspace';

function arrangement(id: string) {
  const row = arrangementRows(createArrangementState()).find((entry) => entry.id === id);
  if (!row) throw new Error(`Missing arrangement fixture ${id}`);
  return row;
}

function open(id: string) {
  const row = arrangement(id);
  const card = screen.getByRole('article', { name: row.name });
  fireEvent.click(within(card).getByRole('button', { name: `Open ${row.name}` }));
  return screen.getByRole('dialog', { name: row.name });
}

function chooseHandler(name: string) {
  fireEvent.click(screen.getByRole('combobox', { name: 'Handled by' }));
  fireEvent.click(screen.getByRole('option', { name }));
}

describe('arrangement meaning and responsibility', () => {
  it('keeps intent and booking need independent, with source kind and purchase evidence', () => {
    render(<ArrangementsWorkspace layout="kinds" />);
    const planned = screen.getByRole('article', { name: arrangement('connection').name });
    expect(planned).toHaveTextContent('In plan');
    expect(planned).toHaveTextContent('Not arranged');
    expect(within(planned).getByRole('img', { name: 'Transport' })).toBeInTheDocument();
    const optional = screen.getByRole('article', { name: arrangement('festival').name });
    expect(optional).toHaveTextContent('Considering');
    expect(optional).toHaveTextContent('Not arranged');
    expect(optional).not.toHaveTextContent(/todo|required/i);
    const birthday = screen.getByRole('article', { name: arrangement('birthday').name });
    expect(birthday).toHaveTextContent('No booking needed');
    expect(within(birthday).getByRole('img', { name: 'Events & tickets' })).toBeInTheDocument();
    expect(screen.getByRole('article', { name: arrangement('flight').name })).toHaveTextContent(
      'Purchased'
    );
    const rental = arrangementRows(createArrangementState()).find((row) => row.kind === 'rental');
    if (!rental) throw new Error('Expected rental fixture');
    const rentalCard = screen.getByRole('article', { name: rental.name });
    expect(rentalCard).toHaveTextContent('Reserved');
    expect(rentalCard).not.toHaveTextContent('Purchased');
    expect(within(rentalCard).getByRole('img', { name: 'Rental' })).toBeInTheDocument();
  });

  it('assigns an optional contact, retains it across dialog opens, clears it and undoes locally', () => {
    render(<ArrangementsWorkspace layout="route" />);
    const name = arrangement('ticket').name;
    expect(screen.getByRole('article', { name })).not.toHaveTextContent('Handled by');
    open('ticket');
    chooseHandler('Clara Silva');
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.getByRole('article', { name })).toHaveTextContent('Handled by Clara Silva');
    open('ticket');
    expect(screen.getByRole('combobox', { name: 'Handled by' })).toHaveTextContent('Clara Silva');
    chooseHandler('Clear handler');
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.getByRole('article', { name })).not.toHaveTextContent('Handled by');
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(screen.getByRole('article', { name })).toHaveTextContent('Handled by Clara Silva');
    expect(screen.getByRole('article', { name })).toHaveTextContent('Purchased');
  });

  it('supports an explicit self choice and preserves unavailable handlers until cleared', () => {
    render(<ArrangementsWorkspace layout="route" scenario="missing-reference" />);
    const name = arrangement('hotel').name;
    expect(screen.getByRole('article', { name })).toHaveTextContent(
      'Handled by Contact unavailable'
    );
    open('hotel');
    expect(screen.getByRole('combobox', { name: 'Handled by' })).toHaveTextContent(
      'Contact unavailable'
    );
    chooseHandler('Alex Costa (me)');
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.getByRole('article', { name })).toHaveTextContent('Handled by Alex Costa');
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(screen.getByRole('article', { name })).toHaveTextContent(
      'Handled by Contact unavailable'
    );
  });
});
