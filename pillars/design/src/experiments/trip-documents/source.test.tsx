import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { TripDocumentsContext } from './context';
import { createTripDocumentsState } from './fixture';
import { documentRows } from './model';
import { DocumentSource } from './source';

describe('document source facts', () => {
  it('shows the actual recorded UTC instant and source URL as text without claiming a file preview', () => {
    const state = createTripDocumentsState();
    const provenance = state.provenance[0];
    if (!provenance) throw new Error('Source provenance missing');
    state.provenance[0] = { ...provenance, url: 'https://example.com/source' };
    const row = documentRows(state, { query: '', mimeType: '', source: 'all', offline: 'all' })[0];
    if (!row) throw new Error('Original document missing');
    render(
      <TripDocumentsContext value={{ state, change: () => undefined }}>
        <DocumentSource row={row}>Original</DocumentSource>
      </TripDocumentsContext>
    );
    fireEvent.click(screen.getByRole('button', { name: `Open ${row.title}` }));
    const source = screen.getByRole('dialog');
    expect(source).toHaveTextContent('Recorded');
    expect(source).toHaveTextContent('UTC');
    expect(source).not.toHaveTextContent('2027-12-20T09:00:00Z');
    expect(source).toHaveTextContent('https://example.com/source');
  });
});
