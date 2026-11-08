import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { EventWorkspace } from './workspace';

function rename(value: string) {
  const input = screen.getByRole('textbox', { name: 'Event name' });
  fireEvent.change(input, { target: { value } });
  fireEvent.blur(input);
}

describe('event workspace', () => {
  it('restores edited event names without adding unchanged title history', () => {
    render(<EventWorkspace layout="details" />);
    fireEvent.blur(screen.getByRole('textbox', { name: 'Event name' }));
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
    rename('Weekend festival');
    expect(screen.getByDisplayValue('Weekend festival')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(screen.getByDisplayValue('Festival Horizonte')).toBeInTheDocument();
  });
  it('keeps end-only dates during progressive capture and after clearing start', () => {
    render(<EventWorkspace layout="details" scenario="new" />);
    rename('Birthday');
    fireEvent.click(screen.getByRole('button', { name: 'Edit event dates' }));
    fireEvent.input(screen.getByLabelText('End date'), { target: { value: '2028-01-24' } });
    expect(screen.getByRole('button', { name: 'Edit event dates' })).toHaveTextContent('→ 24 Jan');
    fireEvent.input(screen.getByLabelText('Start date'), { target: { value: '2028-01-22' } });
    expect(screen.getByLabelText('End date')).toHaveValue('2028-01-24');
    fireEvent.input(screen.getByLabelText('Start date'), { target: { value: '' } });
    expect(screen.getByLabelText('End date')).toHaveValue('2028-01-24');
    fireEvent.keyDown(screen.getByLabelText('End date'), { key: 'Escape' });
    expect(screen.getByDisplayValue('Birthday')).toBeInTheDocument();
  });
  it('creates and links a venue as one reversible source operation', () => {
    render(<EventWorkspace layout="details" />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit venue' }));
    fireEvent.change(screen.getByLabelText('New venue name'), {
      target: { value: 'Praça Central' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create venue' }));
    expect(screen.getByRole('button', { name: 'Edit venue' })).toHaveTextContent('Praça Central');
    fireEvent.click(screen.getByRole('button', { name: 'Purchased' }));
    expect(screen.getByRole('button', { name: 'Edit venue' })).toHaveTextContent('Praça Central');
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(screen.getByRole('button', { name: 'Purchased' })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
    expect(screen.getByRole('button', { name: 'Edit venue' })).toHaveTextContent('Praça Central');
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(screen.getByRole('button', { name: 'Edit venue' })).toHaveTextContent(
      'Centro Cultural da Serra'
    );
  });
  it('links document identities once and can undo unlinking', () => {
    render(<EventWorkspace layout="details" />);
    fireEvent.click(screen.getByRole('combobox', { name: 'Link document' }));
    fireEvent.click(screen.getByRole('option', { name: 'Festival programme.pdf' }));
    expect(screen.getByText('Festival programme.pdf')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Unlink document' }));
    expect(screen.queryByText('Festival programme.pdf')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(screen.getByText('Festival programme.pdf')).toBeInTheDocument();
  });
  it('keeps invalid URLs editable without providing unsafe navigation or blocking other fields', () => {
    render(<EventWorkspace layout="details" />);
    const input = screen.getByRole('textbox', { name: 'Event source URL' });
    fireEvent.change(input, { target: { value: 'javascript:alert(1)' } });
    fireEvent.blur(input);
    expect(screen.queryByRole('link', { name: 'Open event source' })).not.toBeInTheDocument();
    expect(screen.getByText('Use an HTTP or HTTPS URL')).toBeInTheDocument();
    rename('Edited festival');
    expect(screen.getByDisplayValue('Edited festival')).toBeInTheDocument();
  });
  it('records purchase without selecting a route or changing event intention', () => {
    render(<EventWorkspace layout="details" />);
    fireEvent.click(screen.getByRole('button', { name: 'Purchased' }));
    expect(screen.getByRole('button', { name: 'Purchased' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(screen.getByRole('combobox', { name: 'Event intention' })).toHaveValue('Considering');
    expect(screen.getByRole('button', { name: 'Add city to route' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Edit event dates' }));
    expect(screen.getByLabelText('Start date')).toHaveValue('2028-01-22');
    expect(screen.getByLabelText('End date')).toHaveValue('2028-01-24');
  });
  it('renders missing references explicitly without exposing a raw identity', () => {
    render(<EventWorkspace layout="details" scenario="missing-reference" />);
    expect(screen.getByRole('button', { name: 'Edit venue' })).toHaveTextContent(
      'Venue unavailable'
    );
    expect(screen.queryByText('removed-venue')).not.toBeInTheDocument();
  });
  it('retains event controls inside the route-context proposal', () => {
    render(<EventWorkspace layout="route" />);
    expect(screen.getByRole('region', { name: 'Event route context' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Event name' })).toHaveValue('Festival Horizonte');
    expect(
      within(screen.getByRole('region', { name: 'Event route context' })).getByText(
        'Recife / Olinda',
        { selector: 'span' }
      )
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole('region', { name: 'Event route context' })).getByText(
        'Rio de Janeiro',
        { selector: 'span' }
      )
    ).toBeInTheDocument();
  });
});
