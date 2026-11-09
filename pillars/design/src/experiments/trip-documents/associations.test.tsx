import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { DocumentAssociations } from './associations';
import { TripDocumentsContext } from './context';
import { createTripDocumentsState } from './fixture';
import { documentRows } from './model';

import type { TripDocumentsState } from './model';

describe('source dialog association draft isolation', () => {
  it('links to a different target while preserving the global chooser target, selections, query and actual files', () => {
    const state = createTripDocumentsState();
    const file = new File(['pending'], 'pending.pdf', { type: 'application/pdf' });
    state.linking = {
      ...state.linking,
      targetId: 'journey-brazil',
      selectedIds: ['document-image'],
      query: 'station-map',
      files: [file],
    };
    const row = documentRows(state, {
      query: '',
      mimeType: '',
      source: 'all',
      offline: 'all',
    }).find((item) => item.id === 'document-hotel');
    if (!row) throw new Error('Hotel original missing');
    const change = vi.fn((next: TripDocumentsState) => next);
    render(
      <TripDocumentsContext value={{ state, change }}>
        <DocumentAssociations row={row} />
      </TripDocumentsContext>
    );
    fireEvent.click(screen.getByRole('combobox', { name: 'Link document to' }));
    fireEvent.click(screen.getByRole('option', { name: 'Brazil' }));
    fireEvent.click(screen.getByRole('button', { name: 'Link' }));
    expect(change).toHaveBeenCalledOnce();
    const call = change.mock.calls[0];
    if (!call) throw new Error('Association change missing');
    const next = call[0];
    expect(next.linking.targetId).toBe('journey-brazil');
    expect(next.linking.selectedIds).toBe(state.linking.selectedIds);
    expect(next.linking.query).toBe('station-map');
    expect(next.linking.files).toBe(state.linking.files);
    expect(next.linking.files[0]).toBe(file);
    expect(next.linking.documents).toBe(state.linking.documents);
    expect(next.linking.links).toHaveLength(state.linking.links.length + 1);
    expect(next.linking.links).toEqual(
      expect.arrayContaining([
        ...state.linking.links,
        expect.objectContaining({ documentId: 'document-hotel', targetId: 'trip-brazil' }),
      ])
    );
  });
});
