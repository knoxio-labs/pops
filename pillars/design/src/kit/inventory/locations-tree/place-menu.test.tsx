import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { PlaceMenu } from './place-menu';

describe('PlaceMenu', () => {
  it('keeps Rename out of the overflow menu', () => {
    render(
      <PlaceMenu
        name="Garage"
        handlers={{
          onOpen: vi.fn(),
          onNewInside: vi.fn(),
          onMove: vi.fn(),
          onDelete: vi.fn(),
        }}
      />
    );

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Actions for Garage' }), {
      pointerType: 'mouse',
      button: 0,
    });

    expect(screen.queryByRole('menuitem', { name: 'Rename' })).not.toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /^Move/ })).toBeInTheDocument();
  });
});
