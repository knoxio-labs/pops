import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { InboxWorkspace } from './workspace';

describe('text-first Inbox capture', () => {
  it('captures verbatim text without classification and keeps classification separate from organisation', () => {
    render(<InboxWorkspace layout="inline" scenario="empty" />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Capture text' }), {
      target: { value: '  A raw idea\nKeep the second line.  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Capture' }));
    const trigger = screen.getByRole('button', { name: 'Open A raw idea' });
    expect(trigger).toHaveTextContent('To organise');
    fireEvent.click(trigger);
    expect(screen.getByRole('region', { name: 'Raw source' }).textContent).toContain(
      '  A raw idea\nKeep the second line.  '
    );
    expect(screen.getByRole('combobox', { name: 'Existing trip item' })).toHaveTextContent(
      'Choose a trip item'
    );
    fireEvent.click(screen.getByRole('button', { name: 'Close item' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Capture text' }), {
      target: { value: 'Explicitly a note' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Type' }));
    fireEvent.click(screen.getByRole('button', { name: 'Note' }));
    fireEvent.click(screen.getByRole('button', { name: 'Capture' }));
    expect(screen.getByRole('button', { name: 'Open Explicitly a note' })).toHaveTextContent(
      'To organise'
    );
    expect(screen.queryByText('Organised')).not.toBeInTheDocument();
  });

  it('retains actual file handles as source attachments without a fabricated upload', () => {
    const { container } = render(<InboxWorkspace layout="inline" scenario="empty" />);
    fireEvent.click(screen.getByRole('button', { name: 'Attach files' }));
    const input = container.ownerDocument.querySelector('input[type="file"]');
    if (!input) throw new Error('File input missing');
    const file = new File(['source'], 'raw-note.txt', { type: 'text/plain' });
    fireEvent.change(input, { target: { files: [file] } });
    fireEvent.click(screen.getByRole('button', { name: 'Attach files' }));
    expect(screen.getByText('Selected files · not uploaded')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Capture' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open raw-note.txt' }));
    const source = screen.getByRole('region', { name: 'Raw source' });
    const files = within(source).getByRole('list', { name: 'Attachments' });
    expect(files).toHaveTextContent('raw-note.txt');
    expect(within(files).getByRole('img', { name: 'Text' })).toBeInTheDocument();
    expect(
      within(source).queryByRole('button', { name: /Download|Remove attachment/ })
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close item' }));
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(screen.queryByRole('button', { name: 'Open raw-note.txt' })).not.toBeInTheDocument();
  });
  it('preserves an in-progress text and file draft while another source is organised', () => {
    render(<InboxWorkspace layout="dialog" scenario="files" />);
    const draft = screen.getByRole('textbox', { name: 'Capture text' });
    fireEvent.change(draft, { target: { value: 'Next raw source' } });
    fireEvent.click(
      screen.getByRole('button', { name: 'Open Ask Clara about a walk along the waterfront.' })
    );
    fireEvent.click(screen.getByRole('combobox', { name: 'Existing trip item' }));
    fireEvent.click(screen.getByRole('option', { name: /Walk in the old town/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Link' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Close' }));
    expect(draft).toHaveValue('Next raw source');
    expect(screen.getByRole('list', { name: 'Attachments' })).toHaveTextContent('brazil-notes.txt');
    fireEvent.click(screen.getByRole('button', { name: 'Capture' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open Next raw source' }));
    expect(screen.getByRole('region', { name: 'Raw source' })).toHaveTextContent(
      'brazil-notes.txt'
    );
  });
});
