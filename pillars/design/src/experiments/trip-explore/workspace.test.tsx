import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ExploreWorkspace } from './workspace';

function chooseKind(label: string) {
  fireEvent.click(screen.getByRole('combobox', { name: 'Kind' }));
  fireEvent.click(screen.getByRole('option', { name: label }));
}

function search(value: string) {
  fireEvent.change(screen.getByLabelText('Search possibilities'), { target: { value } });
}

describe('trip explore proposals', () => {
  it.each(['collection', 'cities'] as const)(
    'captures unclassified multiline text without dates, opens its own source and undoes it in %s',
    (layout) => {
      render(<ExploreWorkspace layout={layout} scenario="empty" />);
      const text = 'Ask Nara about the waterfront.\nFind a time later.';
      fireEvent.change(screen.getByLabelText('Possibility'), { target: { value: text } });
      expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
      const card = screen.getByRole('article', { name: 'Ask Nara about the waterfront.' });
      const trigger = within(card).getByRole('button', {
        name: 'Open Ask Nara about the waterfront.',
      });
      expect(trigger.tagName).toBe('BUTTON');
      trigger.focus();
      expect(trigger).toHaveFocus();
      fireEvent.click(trigger);
      const dialog = screen.getByRole('dialog', { name: 'Ask Nara about the waterfront.' });
      expect(dialog).toHaveTextContent('Find a time later.');
      expect(within(dialog).queryByRole('combobox', { name: 'Status' })).not.toBeInTheDocument();
      expect(dialog.querySelector('input[type="date"]')).toBeNull();
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
      expect(
        screen.queryByRole('article', { name: 'Ask Nara about the waterfront.' })
      ).not.toBeInTheDocument();
    }
  );

  it('retains explicit classification and selected source location without requiring timing', () => {
    render(<ExploreWorkspace layout="cities" scenario="empty" />);
    fireEvent.change(screen.getByLabelText('Possibility'), {
      target: { value: 'Waterfront sketching' },
    });
    chooseKind('Activity');
    fireEvent.click(screen.getByRole('combobox', { name: 'Location' }));
    fireEvent.click(screen.getByRole('option', { name: 'Olinda' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    const group = screen.getByRole('region', { name: 'Olinda' });
    expect(group).toHaveTextContent('Waterfront sketching');
    expect(group).toHaveTextContent('Activity');
    expect(group).not.toHaveTextContent('Other');
    expect(group).not.toHaveTextContent('Saved');
  });

  it('edits only the selected source and restores it with Undo', () => {
    render(<ExploreWorkspace layout="collection" />);
    fireEvent.click(screen.getByRole('button', { name: 'Open Neighbourhood drawing circle' }));
    const dialog = screen.getByRole('dialog', { name: 'Neighbourhood drawing circle' });
    expect(dialog).toHaveTextContent('Lina Prado');
    fireEvent.change(within(dialog).getByLabelText('Name'), {
      target: { value: 'Evening drawing circle' },
    });
    fireEvent.change(within(dialog).getByLabelText('Notes'), {
      target: { value: 'Bring the small sketchbook.' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }));
    expect(screen.getByRole('article', { name: 'Evening drawing circle' })).toHaveTextContent(
      'Bring the small sketchbook.'
    );
    expect(screen.getByRole('article', { name: 'Olinda' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(
      screen.getByRole('article', { name: 'Neighbourhood drawing circle' })
    ).toBeInTheDocument();
  });

  it('rejects an empty name while retaining the selected source and its references', () => {
    render(<ExploreWorkspace layout="collection" />);
    fireEvent.click(screen.getByRole('button', { name: 'Open Neighbourhood drawing circle' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a name.');
    expect(screen.getByRole('dialog', { name: 'Neighbourhood drawing circle' })).toHaveTextContent(
      'Lina Prado'
    );
  });

  it.each(['collection', 'cities'] as const)(
    'filters actual source facts and retains unavailable references while editing in %s',
    (layout) => {
      render(<ExploreWorkspace layout={layout} scenario="missing-reference" />);
      search('drawing');
      expect(
        screen.getByRole('article', { name: 'Neighbourhood drawing circle' })
      ).toBeInTheDocument();
      expect(screen.queryByRole('article', { name: 'Olinda' })).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Open Neighbourhood drawing circle' }));
      const dialog = screen.getByRole('dialog', { name: 'Neighbourhood drawing circle' });
      expect(dialog).toHaveTextContent('Recommender unavailable');
      fireEvent.change(within(dialog).getByLabelText('Notes'), {
        target: { value: 'Keep the original reference for review.' },
      });
      fireEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }));
      expect(
        screen.getByRole('article', { name: 'Neighbourhood drawing circle' })
      ).toHaveTextContent('Keep the original reference for review.');
      if (layout === 'cities')
        expect(screen.getByRole('region', { name: 'Location unavailable' })).toBeInTheDocument();
    }
  );

  it('removes only a selected collection entry and restores it with Undo', () => {
    render(<ExploreWorkspace layout="collection" />);
    fireEvent.click(screen.getByRole('button', { name: 'Open Olinda' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(screen.queryByRole('article', { name: 'Olinda' })).not.toBeInTheDocument();
    expect(
      screen.getByRole('article', { name: 'Neighbourhood drawing circle' })
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(screen.getByRole('article', { name: 'Olinda' })).toBeInTheDocument();
  });
  it('keeps source regions visible and opens the selected event instead of another fixture', () => {
    render(<ExploreWorkspace layout="cities" />);
    const region = screen.getByRole('region', { name: 'Belo Horizonte / Minas' });
    expect(region).toHaveTextContent('Festival Horizonte');
    fireEvent.click(within(region).getByRole('button', { name: 'Open Festival Horizonte' }));
    const dialog = screen.getByRole('dialog', { name: 'Festival Horizonte' });
    expect(dialog).toHaveTextContent('Centro Cultural da Serra');
    expect(dialog).toHaveTextContent('Horizonte Produções');
    expect(
      within(dialog).getByRole('link', { name: 'https://festival-horizonte.example/programme' })
    ).toHaveAttribute('href', 'https://festival-horizonte.example/programme');
    fireEvent.change(within(dialog).getByLabelText('Notes'), {
      target: { value: 'Check the published programme.' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }));
    expect(screen.getByRole('region', { name: 'Belo Horizonte / Minas' })).toHaveTextContent(
      'Check the published programme.'
    );
  });

  it('offers source-compatible locations when editing an existing city-owned idea', () => {
    render(<ExploreWorkspace layout="collection" />);
    fireEvent.click(screen.getByRole('button', { name: 'Open Neighbourhood drawing circle' }));
    const dialog = screen.getByRole('dialog', { name: 'Neighbourhood drawing circle' });
    fireEvent.click(within(dialog).getByRole('combobox', { name: 'Location' }));
    expect(screen.getByRole('option', { name: 'Olinda' })).toBeInTheDocument();
    expect(
      screen.queryByRole('option', { name: 'Belo Horizonte / Minas' })
    ).not.toBeInTheDocument();
  });

  it('filters existing captured source kinds and shows an empty result without repeated action copy', () => {
    render(<ExploreWorkspace layout="collection" />);
    expect(screen.queryByText(/^Inspect(?: |$)/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('combobox', { name: 'Filter kind' }));
    fireEvent.click(screen.getByRole('option', { name: 'Note' }));
    const results = screen.getByRole('region', { name: 'Possibilities' });
    expect(within(results).getAllByRole('article')).toHaveLength(1);
    expect(results).toHaveTextContent('Ask Clara about a walk along the waterfront.');
    search('no source contains this');
    expect(screen.getByRole('status')).toHaveTextContent('No matching possibilities');
  });
});
