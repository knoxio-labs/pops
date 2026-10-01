import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { SearchPickerDialog, type SearchPickerDialogProps } from './SearchPickerDialog';

function renderPicker(overrides: Partial<SearchPickerDialogProps<string>> = {}) {
  return render(
    <SearchPickerDialog
      trigger={<button type="button">Open search</button>}
      open
      onOpenChange={() => {}}
      title="Paperless documents"
      search="paperless"
      onSearchChange={() => {}}
      isLoading={false}
      results={[]}
      renderResult={(result) => result}
      getResultKey={(result) => result}
      emptyMessage="No documents found"
      {...overrides}
    />
  );
}

describe('SearchPickerDialog error state', () => {
  it('shows the search error instead of the empty-results message', () => {
    renderPicker({ errorMessage: 'Search failed. Try again.', onRetry: vi.fn() });

    expect(screen.getByRole('alert')).toHaveTextContent('Search failed. Try again.');
    expect(screen.queryByText('No documents found')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('renders retry only when a retry callback is supplied', () => {
    renderPicker({ errorMessage: 'Search failed.' });

    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
  });

  it('calls the retry callback when the retry action is selected', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    renderPicker({ errorMessage: 'Search failed.', onRetry });

    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('shows loading while a retry is in progress', () => {
    renderPicker({ errorMessage: 'Search failed.', isLoading: true });

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('dialog').querySelectorAll('[data-slot="skeleton"]')).toHaveLength(3);
  });
});
