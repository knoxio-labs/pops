import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CaptureFileChips } from './file-chips';
import { CaptureWorkspace } from './workspace';

afterEach(cleanup);

describe('capture attachment chips', () => {
  it.each([
    ['image/png', 'Image'],
    ['audio/mpeg', 'Audio'],
    ['video/mp4', 'Video'],
    ['application/pdf', 'PDF'],
    ['text/html', 'HTML'],
    ['text/plain', 'Text'],
    ['', 'File'],
    ['application/octet-stream', 'File'],
  ])('uses the browser MIME type %s for its icon', (type, label) => {
    render(<CaptureFileChips files={[new File(['contents'], 'source', { type })]} />);
    expect(screen.getByRole('img', { name: label })).toBeInTheDocument();
    expect(screen.getByText('source')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('removes the exact occurrence when filenames and metadata match', () => {
    const first = new File(['same'], 'notes.txt', { lastModified: 1 });
    const second = new File(['same'], 'notes.txt', { lastModified: 1 });
    const onChange = vi.fn<(files: File[]) => void>();
    render(<CaptureFileChips files={[first, second]} onChange={onChange} />);
    const remove = screen.getAllByRole('button', { name: 'Remove attachment notes.txt' }).at(1);
    if (!remove) throw new Error('Second attachment removal control missing');
    fireEvent.click(remove);
    const remaining: File[] = onChange.mock.calls[0]?.[0] ?? [];
    expect(remaining).toHaveLength(1);
    expect(remaining[0]).toBe(first);
  });

  it('does not render an empty attachment container', () => {
    render(<CaptureFileChips files={[]} />);
    expect(screen.queryByRole('list', { name: 'Attachments' })).not.toBeInTheDocument();
  });

  it('disables file-only capture after removing the last draft attachment', () => {
    render(<CaptureWorkspace layout="text" scenario="document" />);
    expect(screen.getByRole('button', { name: 'Capture' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Remove attachment brazil-notes.txt' }));
    expect(screen.getByRole('button', { name: 'Capture' })).toBeDisabled();
    expect(screen.queryByRole('list', { name: 'Attachments' })).not.toBeInTheDocument();
  });

  it('undoes captured-file removal without restoring it into the draft', () => {
    render(<CaptureWorkspace layout="text" scenario="document" />);
    fireEvent.click(screen.getByRole('button', { name: 'Capture' }));
    fireEvent.click(screen.getByRole('button', { name: 'Edit brazil-notes.txt' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove attachment brazil-notes.txt' }));
    expect(screen.queryByRole('list', { name: 'Attachments' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(screen.getByRole('list', { name: 'Attachments' })).toHaveTextContent('brazil-notes.txt');
    expect(screen.getByRole('button', { name: 'Capture' })).toBeDisabled();
  });
});
