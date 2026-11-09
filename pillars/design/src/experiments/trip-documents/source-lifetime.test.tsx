import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { TripDocumentsWorkspace } from './workspace';

function openFirstOriginal() {
  const trigger = screen.getAllByRole('button', { name: 'Open Brazil flight confirmation' })[0];
  if (!trigger) throw new Error('Trip original missing');
  expect(trigger.tagName).toBe('BUTTON');
  fireEvent.click(trigger);
}

function linkToBrazil() {
  fireEvent.click(screen.getByRole('combobox', { name: 'Link document to' }));
  fireEvent.click(screen.getByRole('option', { name: 'Brazil' }));
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Link' }));
}

describe('selected original dialog lifetime', () => {
  it('retains the first trip original when its trip occurrence disappears and allows re-linking', () => {
    render(<TripDocumentsWorkspace layout="route" />);
    openFirstOriginal();
    const source = screen.getByRole('dialog');
    fireEvent.click(within(source).getByRole('button', { name: 'Unlink Brazil' }));
    expect(screen.getByRole('dialog')).toBe(source);
    expect(source).toHaveTextContent('flight-confirmation.pdf');
    expect(
      within(source).getByRole('button', { name: 'Unlink SYD → DFW → GRU' })
    ).toBeInTheDocument();
    expect(within(source).queryByRole('button', { name: 'Unlink Brazil' })).not.toBeInTheDocument();
    linkToBrazil();
    expect(within(source).getByRole('button', { name: 'Unlink Brazil' })).toBeInTheDocument();
  });

  it('keeps the catalogue original open after its last trip link is removed', () => {
    render(<TripDocumentsWorkspace layout="route" />);
    openFirstOriginal();
    const source = screen.getByRole('dialog');
    fireEvent.click(within(source).getByRole('button', { name: 'Unlink Brazil' }));
    fireEvent.click(within(source).getByRole('button', { name: 'Unlink SYD → DFW → GRU' }));
    expect(screen.getByRole('dialog')).toBe(source);
    expect(source).toHaveTextContent('flight-confirmation.pdf');
    expect(within(source).queryByRole('button', { name: /^Unlink/ })).not.toBeInTheDocument();
    linkToBrazil();
    expect(within(source).getByRole('button', { name: 'Unlink Brazil' })).toBeInTheDocument();
    fireEvent.click(within(source).getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Open Brazil flight confirmation' })).toHaveLength(
      1
    );
  });

  it('keeps source selection when a filter removes every visible occurrence', () => {
    render(<TripDocumentsWorkspace layout="route" />);
    const search = screen.getByRole('textbox', { name: 'Search documents' });
    openFirstOriginal();
    const source = screen.getByRole('dialog');
    fireEvent.change(search, { target: { value: 'no matching source' } });
    expect(screen.getByRole('dialog')).toBe(source);
    expect(source).toHaveTextContent('flight-confirmation.pdf');
    fireEvent.click(within(source).getByRole('button', { name: 'Close' }));
    expect(screen.getByText('No matching documents')).toBeInTheDocument();
  });

  it('retains an unavailable original identity until close after removing its last broken-source link', () => {
    render(<TripDocumentsWorkspace layout="route" scenario="missing-reference" />);
    const trigger = screen.getAllByRole('button', { name: 'Open Document unavailable' })[0];
    if (!trigger) throw new Error('Unavailable original missing');
    fireEvent.click(trigger);
    const source = screen.getByRole('dialog');
    fireEvent.click(within(source).getByRole('button', { name: 'Unlink SYD → DFW → GRU' }));
    expect(screen.getByRole('dialog')).toBe(source);
    expect(source).toHaveTextContent('The original document is unavailable.');
    expect(within(source).queryByText('File type')).not.toBeInTheDocument();
    fireEvent.click(within(source).getByRole('button', { name: 'Close' }));
    expect(
      screen.queryByRole('button', { name: 'Open Document unavailable' })
    ).not.toBeInTheDocument();
  });
});
