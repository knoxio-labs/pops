import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { TripPeopleWorkspace } from './workspace';

const marinaPlan = 'Marina Duarte · Dinner and a Guaíba walk';

describe('meeting source boundaries', () => {
  it('keeps conflicting availability statements distinct from an agreed meeting', () => {
    render(<TripPeopleWorkspace layout="route" scenario="conflicting" />);
    const card = screen.getByRole('article', { name: marinaPlan });
    expect(card).toHaveTextContent('Agreed meeting');
    expect(card).toHaveTextContent('Available');
    expect(card).toHaveTextContent('Unavailable');
    expect(card).toHaveTextContent(
      'Available and unavailable source windows overlap in this visit.'
    );
    expect(card).toHaveTextContent('The selected dates overlap recorded unavailability.');
    expect(card).not.toHaveTextContent(/purchased|hard commitment/i);
  });

  it('retains source availability but claims no exact trip overlap when visit dates are unknown', () => {
    render(<TripPeopleWorkspace layout="route" scenario="undated" />);
    const card = screen.getByRole('article', { name: marinaPlan });
    expect(card).not.toHaveTextContent(/Available ·|Unavailable ·|missing task|must arrange/i);
    fireEvent.click(within(card).getByRole('button', { name: `Open ${marinaPlan}` }));
    const availability = screen.getByRole('region', { name: 'Source availability' });
    expect(availability).toHaveTextContent('Available');
    expect(availability).toHaveTextContent('Porto Alegre');
    expect(screen.getByLabelText('Meeting from')).toHaveValue('2027-12-24');
  });

  it('keeps unavailable contact and visit references editable without substituting another contact', () => {
    render(<TripPeopleWorkspace layout="route" scenario="missing-reference" />);
    const label = 'Contact unavailable · Dinner and a Guaíba walk';
    const card = screen.getByRole('article', { name: label });
    expect(card).toHaveTextContent('The linked contact is unavailable.');
    expect(card).toHaveTextContent('The selected visit is unavailable.');
    fireEvent.click(within(card).getByRole('button', { name: `Open ${label}` }));
    const dialog = screen.getByRole('dialog', { name: 'Contact unavailable' });
    expect(dialog).not.toHaveTextContent('marina@example.test');
    fireEvent.change(screen.getByLabelText('Meeting notes'), {
      target: { value: 'Keep source references for review.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save meeting' }));
    expect(screen.getByRole('article', { name: label })).toHaveTextContent(
      'The linked contact is unavailable.'
    );
  });

  it('rejects reversed meeting dates and leaves the source plan unchanged', () => {
    render(<TripPeopleWorkspace layout="people" />);
    const card = screen.getByRole('article', { name: marinaPlan });
    fireEvent.click(within(card).getByRole('button', { name: `Open ${marinaPlan}` }));
    fireEvent.change(screen.getByLabelText('Meeting from'), { target: { value: '2027-12-26' } });
    fireEvent.change(screen.getByLabelText('Meeting through'), { target: { value: '2027-12-24' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save meeting' }));
    expect(screen.getByRole('alert')).toHaveTextContent('The end date precedes the start date.');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('article', { name: marinaPlan })).toHaveTextContent(
      '24 Dec — 24 Dec 2027'
    );
  });
});
