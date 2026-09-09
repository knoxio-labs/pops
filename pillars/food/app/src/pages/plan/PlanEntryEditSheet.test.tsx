/**
 * Regression coverage for the servings `NumberInput` in `PlanEntryEditSheet`
 * (POPS-3271). Clearing the field used to snap it to 1 via
 * `Math.max(1, Number(e.target.value))`, so a user who cleared the field to
 * retype a value had every keystroke land after a phantom "1" — see the
 * ticket for the exact defect. `NumberInput` emits `''` on clear (POPS-3202)
 * and the fix must hold onto that empty state instead of re-coercing it.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactElement, type ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const sdk = vi.hoisted(() => ({
  planWeekView: vi.fn(),
  planUpdateEntry: vi.fn(),
  planDeleteEntry: vi.fn(),
}));

vi.mock('../../food-api/index.js', () => sdk);

import { PlanEntryEditSheet } from './PlanEntryEditSheet';

const ENTRY = {
  date: '2026-09-09',
  heroImagePath: null,
  id: 1,
  notes: 'Original notes',
  plannedServings: 4,
  position: 0,
  recipeId: 10,
  recipeRunCookedAt: null,
  recipeRunId: null,
  recipeSlug: 'onion-soup',
  recipeTitle: 'Onion soup',
  recipeType: null,
  recipeVersionId: 1,
  slot: 'dinner',
};

function renderSheet(onClose = vi.fn()) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  function Wrapper({ children }: { children: ReactNode }): ReactElement {
    return (
      <QueryClientProvider client={client}>
        <MemoryRouter>{children}</MemoryRouter>
      </QueryClientProvider>
    );
  }
  return {
    onClose,
    ...render(
      <Wrapper>
        <PlanEntryEditSheet entryId={ENTRY.id} weekStart="2026-09-07" isOpen onClose={onClose} />
      </Wrapper>
    ),
  };
}

describe('PlanEntryEditSheet — servings empty state', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sdk.planWeekView.mockResolvedValue({
      data: { entries: [ENTRY], slots: [], weekStart: '2026-09-07', weekEnd: '2026-09-13' },
    });
    sdk.planUpdateEntry.mockResolvedValue({ data: { ok: true } });
    sdk.planDeleteEntry.mockResolvedValue({ data: { ok: true } });
  });

  it('does not snap the servings field to 1 when cleared, and blocks save while empty', async () => {
    const user = userEvent.setup();
    renderSheet();

    const servings = await screen.findByTestId('edit-servings');
    await screen.findByDisplayValue('4');

    await user.clear(servings);

    expect(servings).toHaveValue(null);
    expect(screen.getByTestId('save-plan-entry')).toBeDisabled();

    await user.type(servings, '12');
    expect(servings).toHaveValue(12);
    expect(screen.getByTestId('save-plan-entry')).not.toBeDisabled();

    await user.click(screen.getByTestId('save-plan-entry'));

    await waitFor(() => expect(sdk.planUpdateEntry).toHaveBeenCalledTimes(1));
    expect(sdk.planUpdateEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        path: { id: ENTRY.id },
        body: expect.objectContaining({ plannedServings: 12 }),
      })
    );
  });
});
