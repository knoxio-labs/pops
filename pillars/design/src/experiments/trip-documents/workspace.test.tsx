import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { TripDocumentsWorkspace } from './workspace';

function openConfirmation() {
  const original = screen.getAllByRole('button', { name: 'Open Brazil flight confirmation' })[0];
  if (!original) throw new Error('Flight confirmation missing');
  fireEvent.click(original);
  return screen.getByRole('dialog');
}

describe('trip document ledger', () => {
  it.each(['route', 'documents'] as const)(
    'opens the same actual original and unlinks one association with Undo in %s',
    (layout) => {
      render(<TripDocumentsWorkspace layout={layout} />);
      const source = openConfirmation();
      expect(source).toHaveTextContent('flight-confirmation.pdf');
      expect(source).toHaveTextContent('application/pdf');
      const plans = within(source).getByRole('region', { name: 'Linked plans' });
      expect(plans).toHaveTextContent('Brazil');
      expect(plans).toHaveTextContent('SYD → DFW → GRU');
      fireEvent.click(within(plans).getByRole('button', { name: 'Unlink Brazil' }));
      expect(plans).not.toHaveTextContent('Brazil');
      expect(plans).toHaveTextContent('SYD → DFW → GRU');
      expect(source).toHaveTextContent('flight-confirmation.pdf');
      fireEvent.click(within(source).getByRole('button', { name: 'Close' }));
      fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
      expect(openConfirmation()).toHaveTextContent('Brazil');
    }
  );

  it('keeps source and offline availability separate without fabricated download actions', () => {
    render(<TripDocumentsWorkspace layout="documents" />);
    const source = openConfirmation();
    expect(source).toHaveTextContent('Source available');
    expect(source).toHaveTextContent('Offline ready');
    expect(within(source).queryByRole('button', { name: /Download/ })).not.toBeInTheDocument();
    expect(within(source).queryByRole('link')).not.toBeInTheDocument();
    expect(screen.queryByText('Inspect')).not.toBeInTheDocument();
  });

  it('opens same-title and same-filename originals by their distinct source identity', () => {
    render(<TripDocumentsWorkspace layout="documents" scenario="duplicate-names" />);
    const originals = screen.getAllByRole('button', { name: 'Open Brazil flight confirmation' });
    expect(originals).toHaveLength(2);
    const second = originals[1];
    if (!second) throw new Error('Second original missing');
    fireEvent.click(second);
    const source = screen.getByRole('dialog');
    expect(source).toHaveTextContent('flight-confirmation.pdf');
    expect(source).toHaveTextContent('96.0 KB');
    expect(source).toHaveTextContent('Olinda · Pousada do Carmo');
    expect(source).not.toHaveTextContent('SYD → DFW → GRU');
    expect(second).toHaveAccessibleDescription('flight-confirmation.pdf · 96.0 KB');
  });

  it('shows a removable missing original without guessing its metadata', () => {
    render(<TripDocumentsWorkspace layout="documents" scenario="missing-reference" />);
    fireEvent.click(screen.getByRole('button', { name: 'Open Document unavailable' }));
    const source = screen.getByRole('dialog');
    expect(source).toHaveTextContent('The original document is unavailable.');
    expect(within(source).queryByText('File type')).not.toBeInTheDocument();
    fireEvent.click(within(source).getByRole('button', { name: 'Unlink SYD → DFW → GRU' }));
    expect(
      within(source).queryByRole('button', { name: 'Unlink SYD → DFW → GRU' })
    ).not.toBeInTheDocument();
  });

  it('uses disclosed filters with removable active values', () => {
    render(<TripDocumentsWorkspace layout="documents" />);
    expect(
      screen.queryByRole('combobox', { name: 'Offline availability' })
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Filters' }));
    fireEvent.click(screen.getByRole('combobox', { name: 'Offline availability' }));
    fireEvent.click(screen.getByRole('option', { name: 'Offline ready' }));
    expect(
      screen.getByRole('button', { name: 'Open Brazil flight confirmation' })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Open Olinda hotel reservation' })
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Filters' }));
    fireEvent.click(screen.getByRole('button', { name: 'Clear Offline availability' }));
    expect(
      screen.getByRole('button', { name: 'Open Olinda hotel reservation' })
    ).toBeInTheDocument();
  });

  it('searches actual filenames and handles an empty source set', () => {
    render(<TripDocumentsWorkspace layout="documents" scenario="empty" />);
    expect(screen.getByText('No matching documents')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox', { name: 'Search documents' }), {
      target: { value: 'nothing' },
    });
    expect(screen.getByText('No matching documents')).toBeInTheDocument();
  });
});
