import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';

import { HistoryPreviewSection } from './history-preview-section.js';

import type { EventModel } from '../../foundation/model/model.js';

const events: EventModel[] = [
  {
    id: '7',
    itemId: 'item-1',
    itemName: 'Desk lamp',
    kind: 'moved',
    at: '2026-09-01T05:06:00.000Z',
    actor: 'web',
    actorName: 'João',
    summary: 'Moved to Study',
    before: 'In hand',
    after: 'Study',
    reason: null,
    undoable: true,
  },
];

describe('HistoryPreviewSection', () => {
  it('shows the latest event row, actor, summary, and full-history action', () => {
    render(
      <MemoryRouter>
        <HistoryPreviewSection itemId="item-1" eventCount={7} events={events} />
      </MemoryRouter>
    );

    expect(screen.getByText('Latest: Moved to Study')).toBeInTheDocument();
    expect(screen.getByLabelText('Recent history')).toBeInTheDocument();
    expect(screen.getByText('João')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'All 7 events' })).toBeInTheDocument();
  });
});
