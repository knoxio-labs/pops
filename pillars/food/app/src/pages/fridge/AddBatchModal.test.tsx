/**
 * End-to-end RTL coverage for `AddBatchModal` — proves batch creation
 * still works through the kit `Select` ingredient/variant/prep-state/unit
 * pickers this ticket migrated off raw select elements.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const sdk = vi.hoisted(() => ({
  batchesCreate: vi.fn(),
  ingredientsList: vi.fn(),
  ingredientsGet: vi.fn(),
  prepStatesList: vi.fn(),
}));

vi.mock('../../food-api/index.js', () => sdk);

import { AddBatchModal } from './AddBatchModal';

function renderModal(onAdded = vi.fn(), onClose = vi.fn()) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  function Wrapper({ children }: { children: ReactNode }): ReactElement {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  return {
    onAdded,
    onClose,
    ...render(
      <Wrapper>
        <AddBatchModal isOpen onClose={onClose} onAdded={onAdded} />
      </Wrapper>
    ),
  };
}

describe('AddBatchModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sdk.ingredientsList.mockResolvedValue({
      data: { items: [{ id: 1, name: 'Tomato', slug: 'tomato' }] },
    });
    sdk.ingredientsGet.mockResolvedValue({
      data: {
        ingredient: { id: 1, name: 'Tomato', slug: 'tomato' },
        variants: [{ id: 10, ingredientId: 1, name: 'Diced', slug: 'diced', defaultUnit: 'g' }],
      },
    });
    sdk.prepStatesList.mockResolvedValue({
      data: { items: [{ id: 5, name: 'Cooked', slug: 'cooked' }] },
    });
    sdk.batchesCreate.mockResolvedValue({ data: { batchId: 42 } });
  });

  it('creates a batch by picking ingredient, variant and prep state through kit Selects', async () => {
    const user = userEvent.setup();
    const { onAdded, onClose } = renderModal();

    await screen.findByRole('option', { name: 'Tomato (tomato)' });
    const ingredientSelect = screen.getByRole('combobox', { name: /^ingredient$/i });
    await user.selectOptions(ingredientSelect, 'Tomato (tomato)');

    const variantSelect = screen.getByRole('combobox', { name: /^variant$/i });
    await waitFor(() => expect(variantSelect).not.toBeDisabled());
    await screen.findByRole('option', { name: 'Diced (diced)' });
    await user.selectOptions(variantSelect, 'Diced (diced)');

    const prepStateSelect = screen.getByRole('combobox', { name: /prep state/i });
    await user.selectOptions(prepStateSelect, 'Cooked');

    await user.type(screen.getByLabelText(/quantity/i), '200');

    await user.click(screen.getByRole('button', { name: /^add batch$/i }));

    await waitFor(() => expect(sdk.batchesCreate).toHaveBeenCalledTimes(1));
    expect(sdk.batchesCreate).toHaveBeenCalledWith({
      body: expect.objectContaining({
        variantId: 10,
        prepStateId: 5,
        qty: 200,
        unit: 'g',
      }),
    });
    await waitFor(() => expect(onAdded).toHaveBeenCalledWith(42));
    expect(onClose).toHaveBeenCalled();
  });

  it('blocks submission with an error when no variant is picked', async () => {
    const user = userEvent.setup();
    renderModal();

    await user.type(screen.getByLabelText(/quantity/i), '5');
    await user.click(screen.getByRole('button', { name: /^add batch$/i }));

    expect(await screen.findByText(/pick an ingredient variant/i)).toBeInTheDocument();
    expect(sdk.batchesCreate).not.toHaveBeenCalled();
  });

  // POPS-3179: a raw `<input type="date">` opts out of `DateInput`'s pinned
  // `lang="en-AU"`, so the native picker's day/month order silently follows
  // the browser locale instead of the app's. Regression guard for that.
  it('pins the produced and expires date fields to en-AU regardless of browser locale', async () => {
    renderModal();

    await screen.findByRole('option', { name: 'Tomato (tomato)' });

    expect(screen.getByLabelText(/^produced$/i)).toHaveAttribute('lang', 'en-AU');
    expect(screen.getByLabelText(/expires \(optional\)/i)).toHaveAttribute('lang', 'en-AU');
  });
});
