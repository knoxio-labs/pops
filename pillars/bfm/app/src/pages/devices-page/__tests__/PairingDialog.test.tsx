import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { PairingDialog } from '../PairingDialog';

import type { PairingCodeModel } from '../usePairingCode';

describe('PairingDialog', () => {
  it('keeps both footer actions inside the compact-screen scroll container', () => {
    const pairing: PairingCodeModel = {
      state: 'expired',
      issued: null,
      remainingMs: 0,
      failure: null,
      paired: null,
      mint: vi.fn(),
      dismiss: vi.fn(),
      complete: vi.fn(),
    };
    render(<PairingDialog pairing={pairing} open onOpenChange={vi.fn()} />);

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveClass('max-md:overflow-y-auto', 'max-md:content-start');
    expect(within(dialog).getByRole('button', { name: 'Mint another' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Done' })).toBeInTheDocument();
  });
});
