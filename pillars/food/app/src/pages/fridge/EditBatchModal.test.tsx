/**
 * RTL coverage for `EditBatchModal` — mostly the POPS-3179 date-field
 * migration off a raw `<input type="date">` onto kit `DateInput`.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const sdk = vi.hoisted(() => ({
  batchesGet: vi.fn(),
  batchesEdit: vi.fn(),
  prepStatesList: vi.fn(),
}));

vi.mock('../../food-api/index.js', () => sdk);

import { EditBatchModal } from './EditBatchModal';

function renderModal(batchId = 1, onClose = vi.fn()) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  function Wrapper({ children }: { children: ReactNode }): ReactElement {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  return {
    onClose,
    ...render(
      <Wrapper>
        <EditBatchModal batchId={batchId} isOpen onClose={onClose} />
      </Wrapper>
    ),
  };
}

describe('EditBatchModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sdk.batchesGet.mockResolvedValue({
      data: {
        data: {
          ingredientName: 'Tomato',
          variantName: 'Diced',
          expiresAt: '2026-06-20T00:00:00.000Z',
          notes: '',
          prepStateId: null,
          sourceType: 'manual',
        },
      },
    });
    sdk.prepStatesList.mockResolvedValue({ data: { items: [] } });
    sdk.batchesEdit.mockResolvedValue({ data: { ok: true } });
  });

  // POPS-3179: a raw `<input type="date">` opts out of `DateInput`'s pinned
  // `lang="en-AU"`, so the native picker's day/month order silently follows
  // the browser locale instead of the app's. Regression guard for that.
  it('pins the expires date field to en-AU regardless of browser locale', async () => {
    renderModal();

    const expires = await screen.findByLabelText(/^expires$/i);
    expect(expires).toHaveAttribute('lang', 'en-AU');
    await waitFor(() => expect(expires).toHaveValue('2026-06-20'));
  });

  it('submits the edited expiry through batchesEdit', async () => {
    const user = userEvent.setup();
    const { onClose } = renderModal();

    const expires = await screen.findByLabelText(/^expires$/i);
    // The fetched batch populates `form` asynchronously via an effect —
    // editing before it lands would just get clobbered once it resolves.
    await waitFor(() => expect(expires).toHaveValue('2026-06-20'));
    fireEvent.change(expires, { target: { value: '2026-07-01' } });

    await user.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => expect(sdk.batchesEdit).toHaveBeenCalledTimes(1));
    expect(sdk.batchesEdit).toHaveBeenCalledWith({
      path: { id: 1 },
      body: expect.objectContaining({ expiresAt: '2026-07-01T00:00:00.000Z' }),
    });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });
});
