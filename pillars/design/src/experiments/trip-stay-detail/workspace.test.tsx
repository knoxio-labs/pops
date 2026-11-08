import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { StayWorkspace } from './workspace';

describe('stay editor', () => {
  it.each(['details', 'visit'] as const)(
    'edits checkout in %s, shows conflicts and undoes the change',
    (layout) => {
      render(<StayWorkspace layout={layout} />);
      expect(screen.getByRole('article', { name: 'Stay editor' })).toHaveTextContent('4 nights');
      const checkout = screen.getByLabelText('Check-out date');
      fireEvent.change(checkout, { target: { value: '2028-01-21' } });
      fireEvent.blur(checkout);
      expect(screen.getByRole('region', { name: 'Stay issues' })).toHaveTextContent(
        'Stays overlap'
      );
      expect(screen.getByRole('article', { name: 'Stay editor' })).toHaveClass(
        'border-destructive'
      );
      fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
      expect(screen.getByLabelText('Check-out date')).toHaveValue('2028-01-20');
      expect(screen.queryByRole('region', { name: 'Stay issues' })).not.toBeInTheDocument();
    }
  );

  it('keeps family agreement soft and preserves facts when type changes', () => {
    render(<StayWorkspace layout="details" scenario="family" />);
    const card = screen.getByRole('article', { name: 'Stay editor' });
    expect(card).toHaveClass('border-dashed');
    expect(screen.getByRole('combobox', { name: 'Stay status' })).toHaveTextContent('Agreed');
    fireEvent.click(screen.getByRole('combobox', { name: 'Stay type' }));
    fireEvent.click(screen.getByRole('option', { name: 'Hotel' }));
    expect(screen.getByLabelText('Address')).toHaveValue('Rua das Acácias, 42 · São Paulo');
    expect(screen.getByRole('combobox', { name: 'Host' })).toHaveTextContent('Marina Costa');
    fireEvent.click(screen.getByRole('combobox', { name: 'Stay status' }));
    fireEvent.click(screen.getByRole('option', { name: 'Purchased' }));
    expect(card).toHaveClass('border-l-app-accent');
    expect(card).not.toHaveClass('border-dashed');
  });

  it('adds a reusable host locally without losing an entered address and can undo', () => {
    render(<StayWorkspace layout="details" />);
    const address = screen.getByLabelText('Address');
    fireEvent.change(address, { target: { value: 'A new address' } });
    fireEvent.blur(address);
    fireEvent.click(screen.getByRole('button', { name: 'New contact' }));
    fireEvent.change(screen.getByLabelText('Contact name'), { target: { value: 'Alex Example' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add contact' }));
    expect(screen.getByRole('combobox', { name: 'Host' })).toHaveTextContent('Alex Example');
    expect(screen.getByLabelText('Address')).toHaveValue('A new address');
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(screen.getByRole('combobox', { name: 'Host' })).toHaveTextContent(
      'Hotel Jardim reception'
    );
    expect(screen.getByLabelText('Address')).toHaveValue('A new address');
  });

  it('unlinks documents without losing the catalogue and supports selecting them again', () => {
    render(<StayWorkspace layout="visit" />);
    const docs = within(screen.getByRole('region', { name: 'Stay documents' }));
    fireEvent.click(docs.getByRole('button', { name: 'Unlink Hotel reservation.pdf' }));
    expect(docs.queryByText('Hotel reservation.pdf')).not.toBeInTheDocument();
    fireEvent.click(docs.getByRole('combobox', { name: 'Link stay document' }));
    fireEvent.click(screen.getByRole('option', { name: 'Hotel reservation.pdf' }));
    expect(docs.getByRole('button', { name: 'Unlink Hotel reservation.pdf' })).toBeInTheDocument();
  });

  it('leaves empty optional selections out of the way', () => {
    render(<StayWorkspace layout="details" scenario="empty" />);
    expect(screen.getByLabelText('Stay name')).toHaveValue('');
    expect(screen.getByLabelText('Check-in date')).toHaveValue('');
    expect(screen.queryByRole('button', { name: /Unlink/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Stay issues' })).not.toBeInTheDocument();
    expect(screen.getByRole('article', { name: 'Stay editor' })).not.toHaveTextContent(/nights/);
  });
});
