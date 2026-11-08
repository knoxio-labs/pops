import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';

import { CaptureVisit } from './references';

function Picker({ initial = '' }: { initial?: string }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <CaptureVisit value={value} onChange={setValue} />
      <output aria-label="Selected visit">{value}</output>
    </>
  );
}

describe('capture destination picker', () => {
  it('searches display labels and selects the original visit identity', async () => {
    render(<Picker />);
    fireEvent.click(screen.getByRole('combobox', { name: 'Capture destination' }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Find a visit' }), {
      target: { value: 'Olinda' },
    });
    await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(1));
    fireEvent.click(screen.getByRole('option', { name: /Recife \/ Olinda/ }));
    expect(screen.getByRole('status', { name: 'Selected visit' })).toHaveTextContent('recife');
    expect(screen.getByRole('combobox', { name: 'Capture destination' })).toHaveTextContent(
      'Recife / Olinda'
    );
    expect(screen.queryByRole('option')).not.toBeInTheDocument();
  });

  it('returns to the inbox without replacing its empty source reference with a UI identifier', () => {
    render(<Picker initial="recife" />);
    fireEvent.click(screen.getByRole('combobox', { name: 'Capture destination' }));
    fireEvent.click(screen.getByRole('option', { name: 'Inbox' }));
    expect(screen.getByRole('status', { name: 'Selected visit' })).toBeEmptyDOMElement();
    expect(screen.getByRole('combobox', { name: 'Capture destination' })).toHaveTextContent(
      'Inbox'
    );
  });

  it('offers an empty search result and preserves unavailable references', async () => {
    render(<Picker initial="removed-visit" />);
    expect(screen.getByRole('combobox', { name: 'Capture destination' })).toHaveTextContent(
      'Visit unavailable'
    );
    fireEvent.click(screen.getByRole('combobox', { name: 'Capture destination' }));
    expect(screen.getByRole('option', { name: 'Visit unavailable' })).toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox', { name: 'Find a visit' }), {
      target: { value: 'no such destination' },
    });
    await waitFor(() => expect(screen.queryByRole('option')).not.toBeInTheDocument());
    expect(screen.getByText('No matching visits')).toBeInTheDocument();
    expect(screen.getByRole('status', { name: 'Selected visit' })).toHaveTextContent(
      'removed-visit'
    );
  });
});
