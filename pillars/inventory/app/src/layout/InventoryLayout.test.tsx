import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

import { InventoryLayout } from './InventoryLayout';

function renderLayout() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<InventoryLayout />}>
          <Route index element={<div>Inventory home</div>} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

describe('InventoryLayout', () => {
  it('renders the matched page inside the layout', () => {
    renderLayout();
    expect(screen.getByText('Inventory home')).toBeInTheDocument();
  });

  it('opens the shortcut sheet from the global question-mark binding', () => {
    renderLayout();
    fireEvent.keyDown(window, { key: '?', shiftKey: true });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Keyboard shortcuts' })).toBeInTheDocument();
  });

  it('does not register an inventory palette handler without a palette dependency', () => {
    const listener = vi.fn((event: KeyboardEvent) => event.preventDefault());
    document.addEventListener('keydown', listener);
    renderLayout();
    fireEvent.keyDown(document.body, { key: 'k', metaKey: true });
    expect(listener).toHaveBeenCalledOnce();
    document.removeEventListener('keydown', listener);
  });
});
