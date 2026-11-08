import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { CaptureWorkspace } from './workspace';

describe('capture and later enrichment', () => {
  it('captures unclassified text by keyboard and keeps it through event classification', () => {
    render(<CaptureWorkspace layout="text" scenario="empty" />);
    const source = 'Dinner with Clara\nAsk which evening works.';
    fireEvent.change(screen.getByLabelText('Capture text'), { target: { value: source } });
    fireEvent.keyDown(screen.getByLabelText('Capture text'), { key: 'Enter', ctrlKey: true });
    const row = screen.getByRole('article', { name: 'Dinner with Clara' });
    fireEvent.click(within(row).getByRole('button', { name: 'Edit Dinner with Clara' }));
    fireEvent.click(within(row).getByRole('button', { name: 'Event' }));
    expect(within(row).getByLabelText('Captured text')).toHaveValue(source);
    expect(within(row).getByRole('button', { name: 'Event' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(screen.getByLabelText('Capture text')).toHaveValue('');
  });

  it('requires a type first while text-first needs no classification', () => {
    render(<CaptureWorkspace layout="type" scenario="empty" />);
    expect(screen.queryByLabelText('Capture text')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Idea' }));
    fireEvent.change(screen.getByLabelText('Capture text'), { target: { value: 'Visit Minas' } });
    fireEvent.click(screen.getByRole('button', { name: 'Capture' }));
    expect(screen.getByRole('article', { name: 'Visit Minas' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Idea' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('uses a whole-URL suggestion only after a click and retains its text', () => {
    render(<CaptureWorkspace layout="text" scenario="link" />);
    expect(screen.queryByLabelText('Capture URL')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Use link' }));
    expect(screen.getByLabelText('Capture URL')).toHaveValue('https://recife.example/festival');
    fireEvent.click(screen.getByRole('button', { name: 'Capture' }));
    fireEvent.click(screen.getByRole('button', { name: 'Edit https://recife.example/festival' }));
    expect(screen.getByLabelText('Captured text')).toHaveValue('https://recife.example/festival');
    expect(screen.getByRole('link', { name: 'Open captured link' })).toHaveAttribute(
      'href',
      'https://recife.example/festival'
    );
  });

  it('captures actual file-only source and retains it after changing classification', () => {
    render(<CaptureWorkspace layout="text" scenario="document" />);
    fireEvent.click(screen.getByRole('button', { name: 'Capture' }));
    fireEvent.click(screen.getByRole('button', { name: 'Edit brazil-notes.txt' }));
    const row = screen.getByRole('article', { name: 'brazil-notes.txt' });
    fireEvent.click(within(row).getByRole('button', { name: 'Note' }));
    expect(within(row).getAllByText('brazil-notes.txt')).toHaveLength(2);
    expect(within(row).getByRole('button', { name: 'Attach files' })).toHaveTextContent('1');
  });

  it('undoes captured records without discarding a new draft', () => {
    render(<CaptureWorkspace layout="text" scenario="empty" />);
    fireEvent.change(screen.getByLabelText('Capture text'), { target: { value: 'First note' } });
    fireEvent.click(screen.getByRole('button', { name: 'Capture' }));
    fireEvent.change(screen.getByLabelText('Capture text'), { target: { value: 'Still typing' } });
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Capture text')).toHaveValue('Still typing');
  });

  it('keeps unavailable visit references readable and invalid URLs non-navigable', () => {
    render(<CaptureWorkspace layout="text" scenario="missing-reference" />);
    expect(screen.getByText('Visit unavailable')).toBeInTheDocument();
    const row = screen.getByRole('article', {
      name: 'Ask Clara about a walk along the waterfront.',
    });
    fireEvent.click(within(row).getByRole('button', { name: /^Edit / }));
    const field = within(row).getByLabelText('Captured URL');
    fireEvent.blur(field, { target: { value: 'javascript:alert(1)' } });
    expect(within(row).queryByRole('link', { name: 'Open captured link' })).not.toBeInTheDocument();
    expect(within(row).getByText('Use an HTTP or HTTPS URL')).toBeInTheDocument();
  });
});
