import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { TripDocumentsWorkspace } from './workspace';

describe('document capture references', () => {
  it('links an existing original without duplicating it and restores associations with Undo', () => {
    render(<TripDocumentsWorkspace layout="documents" />);
    fireEvent.click(screen.getByRole('button', { name: 'Add documents' }));
    const capture = screen.getByRole('region', { name: 'Add documents' });
    expect(within(capture).getByText('Upload a file')).toBeInTheDocument();
    fireEvent.click(within(capture).getByRole('button', { name: 'Choose existing' }));
    const picker = screen.getByRole('dialog');
    fireEvent.click(within(picker).getByRole('button', { name: /Olinda hotel reservation/ }));
    fireEvent.click(within(picker).getByRole('button', { name: 'Link 1 document' }));
    expect(screen.getAllByRole('button', { name: 'Open Olinda hotel reservation' })).toHaveLength(
      1
    );
    fireEvent.click(screen.getByRole('button', { name: 'Open Olinda hotel reservation' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('SYD → DFW → GRU');
    expect(screen.getByRole('dialog')).toHaveTextContent('Olinda · Pousada do Carmo');
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Close' }));
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open Olinda hotel reservation' }));
    expect(screen.getByRole('dialog')).not.toHaveTextContent('SYD → DFW → GRU');
    expect(screen.getByRole('dialog')).toHaveTextContent('Olinda · Pousada do Carmo');
  });

  it('keeps unlinked catalogue originals out of the trip and offers them only in the chooser', () => {
    render(<TripDocumentsWorkspace layout="documents" />);
    expect(
      screen.queryByRole('button', { name: 'Open Curitiba station map' })
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Open Olinda hotel reservation' }));
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Unlink Olinda · Pousada do Carmo',
      })
    );
    expect(
      screen.queryByRole('button', { name: 'Open Olinda hotel reservation' })
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Add documents' }));
    fireEvent.click(screen.getByRole('button', { name: 'Choose existing' }));
    const picker = screen.getByRole('dialog');
    expect(within(picker).getByRole('button', { name: /Curitiba station map/ })).toBeEnabled();
    expect(within(picker).getByRole('button', { name: /Olinda hotel reservation/ })).toBeEnabled();
    expect(within(picker).getByRole('button', { name: /Previous itinerary/ })).toBeDisabled();
  });

  it('stages actual files with MIME icons and no invented uploaded original', () => {
    const { container } = render(<TripDocumentsWorkspace layout="documents" />);
    fireEvent.click(screen.getByRole('button', { name: 'Add documents' }));
    const input = container.querySelector('input[type="file"]');
    if (!input) throw new Error('File selection input missing');
    const file = new File(['text'], 'local-note.txt', { type: 'text/plain' });
    fireEvent.change(input, { target: { files: [file] } });
    expect(screen.getByText('Selected files · not uploaded')).toBeInTheDocument();
    const attachments = screen.getByRole('list', { name: 'Attachments' });
    expect(attachments).toHaveTextContent('local-note.txt');
    expect(within(attachments).getByRole('img', { name: 'Text' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Open local-note.txt' })).not.toBeInTheDocument();
    fireEvent.click(
      within(attachments).getByRole('button', { name: 'Remove attachment local-note.txt' })
    );
    expect(screen.queryByRole('list', { name: 'Attachments' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(screen.getByRole('list', { name: 'Attachments' })).toHaveTextContent('local-note.txt');
  });
});
