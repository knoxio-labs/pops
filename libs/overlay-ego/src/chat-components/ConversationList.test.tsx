import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ConversationList } from './ConversationList';

describe('ConversationList', () => {
  it('keeps its search input at 16px on narrow screens', () => {
    render(
      <ConversationList
        conversations={[]}
        isLoading={false}
        selectedId={null}
        onSelect={vi.fn()}
        onNew={vi.fn()}
        onDelete={vi.fn()}
        isDeleting={false}
        searchQuery=""
        onSearchChange={vi.fn()}
      />
    );

    expect(screen.getByRole('textbox', { name: 'Search conversations' })).toHaveClass(
      'text-base',
      'md:text-sm'
    );
  });
});
