/**
 * RTL coverage for the add-plan-entry form fields (POPS-3269).
 *
 * The recipe picker used to stack a raw search `<input>` driving the server
 * query on top of a `ComboboxSelect` with its own client-side search, so the
 * two boxes answered the same question with different result sets. These
 * tests pin the collapsed single-affordance behaviour: what is typed reaches
 * the server, and a recipe outside the first fetched page is reachable.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const recipesListMock = vi.hoisted(() => vi.fn());
const planAddEntryMock = vi.hoisted(() => vi.fn());

vi.mock('../../../food-api/index.js', () => ({
  recipesList: recipesListMock,
  planAddEntry: planAddEntryMock,
}));

import { AddPlanEntryModal } from '../AddPlanEntryModal.js';

interface Recipe {
  id: number;
  slug: string;
  title: string;
}

const firstPage: Recipe[] = Array.from({ length: 25 }, (_, i) => ({
  id: i + 1,
  slug: `pancakes-${i + 1}`,
  title: `Pancakes ${i + 1}`,
}));

/** Only reachable by searching: it sits outside the 25-item first page. */
const beyondFirstPage: Recipe = { id: 900, slug: 'zucchini-fritters', title: 'Zucchini Fritters' };

const allRecipes = [...firstPage, beyondFirstPage];

function primeRecipes(): void {
  recipesListMock.mockImplementation(({ body }: { body: { search?: string; limit: number } }) => {
    const search = body.search;
    const matched =
      search === undefined
        ? allRecipes
        : allRecipes.filter((r) => r.title.toLowerCase().includes(search.toLowerCase()));
    return Promise.resolve({ data: { items: matched.slice(0, body.limit), nextCursor: null } });
  });
}

function renderModal(): { user: ReturnType<typeof userEvent.setup>; modal: () => HTMLElement } {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const ui: ReactElement = (
    <QueryClientProvider client={client}>
      <AddPlanEntryModal date="2026-06-15" slot="dinner" isOpen onClose={() => undefined} />
    </QueryClientProvider>
  );
  render(ui);
  return {
    user: userEvent.setup(),
    modal: () => screen.getByTestId('add-plan-entry-modal'),
  };
}

describe('AddPlanEntryFields — recipe picker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    primeRecipes();
    planAddEntryMock.mockResolvedValue({ data: { ok: true, id: 1 } });
  });

  it('offers exactly one search affordance for the recipe', async () => {
    const { modal } = renderModal();
    await screen.findByLabelText('Recipe');
    const recipeFields = within(modal()).getAllByLabelText('Recipe');
    expect(recipeFields).toHaveLength(1);
    // The one field IS the picker, not a text box feeding a second search.
    expect(recipeFields[0]).toHaveAttribute('role', 'combobox');
  });

  it('finds a recipe that is outside the first fetched page', async () => {
    const { user } = renderModal();
    const field = await screen.findByLabelText('Recipe');

    // Proves the query reaches the server: "Zucchini Fritters" is not in the
    // 25 options the picker has already fetched, so a client-side filter over
    // those options can never surface it.
    expect(screen.queryByText('Zucchini Fritters')).not.toBeInTheDocument();
    await user.type(field, 'zucchini');

    expect(await screen.findByText('Zucchini Fritters')).toBeInTheDocument();
  });

  it('submits the recipe picked from the suggestions', async () => {
    const { user } = renderModal();
    const field = await screen.findByLabelText('Recipe');
    await user.type(field, 'zucchini');
    await user.click(await screen.findByText('Zucchini Fritters'));

    await user.click(screen.getByTestId('add-plan-submit'));

    expect(planAddEntryMock).toHaveBeenCalledWith({
      body: expect.objectContaining({ recipeId: 900, date: '2026-06-15', slot: 'dinner' }),
    });
  });

  it('drops the picked recipe once the query is edited again', async () => {
    const { user } = renderModal();
    const field = await screen.findByLabelText('Recipe');
    await user.type(field, 'zucchini');
    await user.click(await screen.findByText('Zucchini Fritters'));
    expect(screen.getByTestId('add-plan-submit')).toBeEnabled();

    await user.type(field, 'x');

    expect(screen.getByTestId('add-plan-submit')).toBeDisabled();
  });
});

describe('AddPlanEntryFields — planned servings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    primeRecipes();
    planAddEntryMock.mockResolvedValue({ data: { ok: true, id: 1 } });
  });

  it('lets the quantity be cleared instead of snapping back to 1', async () => {
    const { user } = renderModal();
    const servings = await screen.findByTestId('add-plan-servings');
    await user.clear(servings);

    expect(servings).toHaveValue(null);
  });

  it('blocks submission while the quantity is empty', async () => {
    const { user } = renderModal();
    const field = await screen.findByLabelText('Recipe');
    await user.type(field, 'zucchini');
    await user.click(await screen.findByText('Zucchini Fritters'));
    expect(screen.getByTestId('add-plan-submit')).toBeEnabled();

    await user.clear(await screen.findByTestId('add-plan-servings'));

    expect(screen.getByTestId('add-plan-submit')).toBeDisabled();
  });
});

describe('AddPlanEntryFields — notes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    primeRecipes();
  });

  it('caps the notes field at 1000 characters', async () => {
    renderModal();
    const notes = await screen.findByTestId('add-plan-notes');
    expect(notes).toHaveAttribute('maxlength', '1000');
  });
});
