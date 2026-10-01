import { render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { DimensionListItem } from './components/dimension-manager/DimensionListItem';
import { NotesEditor } from './pages/watchlist/WatchlistItemNotes';

describe('Media editable controls', () => {
  it('keeps the watchlist note editor at 16px on narrow screens', () => {
    render(
      <NotesEditor
        draft=""
        setDraft={vi.fn()}
        handleKeyDown={vi.fn()}
        handleSave={vi.fn()}
        handleCancel={vi.fn()}
        isUpdating={false}
        textareaRef={createRef<HTMLTextAreaElement>()}
        title="Movie"
        updateError={null}
      />
    );

    expect(screen.getByRole('textbox', { name: 'Notes for Movie' })).toHaveClass(
      'text-base',
      'md:text-xs'
    );
  });

  it('keeps both dimension edit fields at 16px on narrow screens', () => {
    render(
      <DimensionListItem
        dim={{
          id: 1,
          name: 'Story',
          description: 'Description',
          active: true,
          sortOrder: 0,
          weight: 1,
        }}
        idx={0}
        isLast
        editing={{ id: 1, name: 'Story', description: 'Description' }}
        setEditing={vi.fn()}
        onSaveEdit={vi.fn()}
        onReorder={vi.fn()}
        onStartEdit={vi.fn()}
        onToggleActive={vi.fn()}
        onWeightDrag={vi.fn()}
        onWeightCommit={vi.fn()}
        localWeight={1}
        isPending={false}
      />
    );

    for (const field of screen.getAllByRole('textbox')) {
      expect(field).toHaveClass('text-base', 'md:text-sm');
    }
  });
});
