import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { TripPeopleWorkspace } from './workspace';

const marinaPlan = 'Marina Duarte · Dinner and a Guaíba walk';
const linaPlan = 'Lina Prado · Walk with Lina';

function openPlan(label: string, person: string) {
  const card = screen.getByRole('article', { name: label });
  const button = within(card).getByRole('button', { name: `Open ${label}` });
  expect(button.tagName).toBe('BUTTON');
  button.focus();
  expect(button).toHaveFocus();
  fireEvent.click(button);
  return screen.getByRole('dialog', { name: person });
}

function selectAgreement(value: string) {
  fireEvent.click(screen.getByRole('combobox', { name: 'Agreement' }));
  fireEvent.click(screen.getByRole('option', { name: value }));
}

describe('trip people grouping proposals', () => {
  it.each(['route', 'people'] as const)(
    'opens the selected source and keeps same-name contacts separate in %s',
    (layout) => {
      render(<TripPeopleWorkspace layout={layout} />);
      expect(screen.queryByText(/^Inspect(?: |$)/)).not.toBeInTheDocument();
      if (layout === 'route') {
        expect(screen.getByRole('article', { name: marinaPlan })).toHaveTextContent(
          'marina@example.test'
        );
        expect(
          screen.getByRole('article', { name: 'Marina Duarte · Drawing group catch-up' })
        ).toHaveTextContent('other-marina@example.test');
        expect(screen.getByRole('article', { name: linaPlan })).not.toHaveTextContent(
          'lina@example.test'
        );
      }
      let dialog = openPlan(marinaPlan, 'Marina Duarte');
      expect(dialog).toHaveTextContent('marina@example.test');
      expect(dialog).not.toHaveTextContent('other-marina@example.test');
      expect(
        within(dialog).getByRole('button', { name: 'Copy Marina Duarte Personal' })
      ).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Close' }));
      dialog = openPlan('Marina Duarte · Drawing group catch-up', 'Marina Duarte');
      expect(dialog).toHaveTextContent('other-marina@example.test');
      expect(dialog).not.toHaveTextContent('marina@studio.example.test');
    }
  );

  it('edits a meeting without inferring dates from availability and restores it with Undo', () => {
    render(<TripPeopleWorkspace layout="route" />);
    openPlan(linaPlan, 'Lina Prado');
    fireEvent.change(screen.getByLabelText('Meeting plan'), {
      target: { value: 'Meet at the waterfront' },
    });
    selectAgreement('Agreed');
    fireEvent.click(screen.getByRole('button', { name: 'Save meeting' }));
    const updated = screen.getByRole('article', { name: 'Lina Prado · Meet at the waterfront' });
    expect(updated).toHaveTextContent('Considering');
    expect(updated).toHaveTextContent('Agreed meeting');
    openPlan('Lina Prado · Meet at the waterfront', 'Lina Prado');
    expect(screen.getByLabelText('Meeting from')).toHaveValue('');
    expect(screen.getByLabelText('Meeting through')).toHaveValue('');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(screen.getByRole('article', { name: linaPlan })).toHaveTextContent('Not agreed');
  });

  it('links an existing person without invented meeting fields and removes only that trip link', () => {
    render(<TripPeopleWorkspace layout="people" scenario="empty" />);
    expect(screen.getByRole('status')).toHaveTextContent('No matching people or plans');
    fireEvent.click(screen.getByRole('button', { name: 'Add person' }));
    fireEvent.click(screen.getByRole('combobox', { name: 'Existing person' }));
    fireEvent.click(screen.getByRole('option', { name: 'Lina Prado' }));
    fireEvent.click(screen.getByRole('button', { name: 'Link person' }));
    const card = screen.getByRole('article', { name: 'Lina Prado' });
    expect(card).toHaveTextContent('Considering');
    openPlan('Lina Prado', 'Lina Prado');
    expect(screen.getByLabelText('Meeting plan')).toHaveValue('');
    expect(screen.getByLabelText('Meeting from')).toHaveValue('');
    expect(screen.getByLabelText('Meeting through')).toHaveValue('');
    expect(screen.getByRole('dialog', { name: 'Lina Prado' })).toHaveTextContent(
      'lina@example.test'
    );
    fireEvent.click(screen.getByRole('button', { name: 'Remove plan' }));
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(screen.getByRole('article', { name: 'Lina Prado' })).toBeInTheDocument();
  });

  it('retains disclosed filters as removable active values and searches actual source methods', () => {
    render(<TripPeopleWorkspace layout="people" />);
    expect(screen.queryByRole('combobox', { name: 'Filter agreement' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Filters' }));
    fireEvent.click(screen.getByRole('combobox', { name: 'Filter agreement' }));
    fireEvent.click(screen.getByRole('option', { name: 'Agreed' }));
    fireEvent.click(screen.getByRole('button', { name: 'Filters' }));
    expect(screen.getByRole('button', { name: 'Clear agreement filter' })).toBeInTheDocument();
    expect(screen.getByRole('article', { name: marinaPlan })).toBeInTheDocument();
    expect(screen.queryByRole('article', { name: linaPlan })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Clear agreement filter' }));
    fireEvent.change(screen.getByLabelText('Search people and plans'), {
      target: { value: 'other-marina@example.test' },
    });
    expect(screen.getAllByRole('article')).toHaveLength(2);
    expect(screen.queryByRole('article', { name: marinaPlan })).not.toBeInTheDocument();
  });
});
