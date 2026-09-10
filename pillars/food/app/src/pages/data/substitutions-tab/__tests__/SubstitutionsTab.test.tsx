import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type JSX, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const substitutionsListHydratedMock = vi.hoisted(() => vi.fn());
const slugsSearchMock = vi.hoisted(() => vi.fn());
const ingredientsGetMock = vi.hoisted(() => vi.fn());
const substitutionsCreateMock = vi.hoisted(() => vi.fn());
const substitutionsUpdateMock = vi.hoisted(() => vi.fn());
const substitutionsDeleteMock = vi.hoisted(() => vi.fn());

vi.mock('../../../../food-api/index.js', () => ({
  substitutionsListHydrated: substitutionsListHydratedMock,
  slugsSearch: slugsSearchMock,
  ingredientsGet: ingredientsGetMock,
  substitutionsCreate: substitutionsCreateMock,
  substitutionsUpdate: substitutionsUpdateMock,
  substitutionsDelete: substitutionsDeleteMock,
}));

import { elementAt } from '../../../../test-utils';
import { SubstitutionsTab } from '../../SubstitutionsTab';

function withClient(children: ReactNode): JSX.Element {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function renderTab(): void {
  render(withClient(<SubstitutionsTab />));
}

function row(
  overrides: Partial<{
    id: number;
    ratio: number;
    scope: 'global' | 'recipe';
    recipeId: number | null;
    recipeSlug: string | null;
    contextTags: readonly string[];
    fromSlug: string;
    toSlug: string;
    fromKind: 'ingredient' | 'variant';
    toKind: 'ingredient' | 'variant';
  }> & { id: number }
) {
  const fromKind = overrides.fromKind ?? 'ingredient';
  const toKind = overrides.toKind ?? 'ingredient';
  return {
    id: overrides.id,
    fromIngredientId: fromKind === 'ingredient' ? 100 : null,
    fromVariantId: fromKind === 'variant' ? 200 : null,
    toIngredientId: toKind === 'ingredient' ? 300 : null,
    toVariantId: toKind === 'variant' ? 400 : null,
    ratio: overrides.ratio ?? 1,
    scope: overrides.scope ?? 'global',
    recipeId: overrides.recipeId ?? null,
    notes: null,
    createdAt: '2026-06-09',
    contextTags: overrides.contextTags ?? [],
    from: {
      kind: fromKind,
      id: fromKind === 'ingredient' ? 100 : 200,
      slug: overrides.fromSlug ?? 'butter',
      name: 'From',
      parentSlug: fromKind === 'variant' ? 'milk' : null,
    },
    to: {
      kind: toKind,
      id: toKind === 'ingredient' ? 300 : 400,
      slug: overrides.toSlug ?? 'olive-oil',
      name: 'To',
      parentSlug: toKind === 'variant' ? 'olive' : null,
    },
    recipeSlug: overrides.recipeSlug ?? null,
  };
}

function seedList(rows: ReturnType<typeof row>[]) {
  substitutionsListHydratedMock.mockResolvedValue({ data: { items: rows } });
}

beforeEach(() => {
  vi.clearAllMocks();
  substitutionsListHydratedMock.mockResolvedValue({ data: { items: [] } });
  slugsSearchMock.mockResolvedValue({ data: { items: [] } });
  ingredientsGetMock.mockResolvedValue({ data: { ingredient: {}, variants: [] } });
  substitutionsCreateMock.mockResolvedValue({ data: {} });
  substitutionsUpdateMock.mockResolvedValue({ data: {} });
  substitutionsDeleteMock.mockResolvedValue({ data: { ok: true } });
});

describe('pillars/food/docs/prds/substitution-model — SubstitutionsTab', () => {
  it('renders rows for each substitution returned by listHydrated', async () => {
    seedList([
      row({ id: 1, ratio: 1.25, contextTags: ['baking'] }),
      row({ id: 2, fromSlug: 'sugar', toSlug: 'honey', ratio: 0.75 }),
    ]);
    renderTab();
    expect(await screen.findByTestId('sub-row-1')).toBeInTheDocument();
    expect(screen.getByTestId('sub-row-2')).toBeInTheDocument();
    expect(screen.getByText('butter')).toBeInTheDocument();
    expect(screen.getByText('honey')).toBeInTheDocument();
    expect(screen.getByText('baking')).toBeInTheDocument();
  });

  it('renders variant endpoints with parent slug prefix', async () => {
    seedList([
      row({ id: 3, fromKind: 'variant', fromSlug: 'whole', toKind: 'variant', toSlug: 'skim' }),
    ]);
    renderTab();
    expect(await screen.findByText('milk:whole')).toBeInTheDocument();
    expect(screen.getByText('olive:skim')).toBeInTheDocument();
  });

  it('shows the empty state when no rows match', async () => {
    seedList([]);
    renderTab();
    expect(await screen.findByText(/no substitutions match/i)).toBeInTheDocument();
  });

  it('clicking Edit reveals inline ratio + tags inputs and Save fires update mutation', async () => {
    seedList([row({ id: 5, ratio: 1, contextTags: ['baking'] })]);
    renderTab();
    const row5 = await screen.findByTestId('sub-row-5');
    await userEvent.click(within(row5).getByRole('button', { name: /^edit$/i }));
    const ratioInput = within(row5).getByLabelText(/edit ratio for substitution 5/i);
    await userEvent.clear(ratioInput);
    await userEvent.type(ratioInput, '2.5');
    const tagsInput = within(row5).getByLabelText(/edit context tags for substitution 5/i);
    await userEvent.clear(tagsInput);
    await userEvent.type(tagsInput, 'baking, vegan');
    await userEvent.click(within(row5).getByRole('button', { name: /^save$/i }));
    await waitFor(() => {
      expect(substitutionsUpdateMock).toHaveBeenCalledWith({
        path: { id: 5 },
        body: { ratio: 2.5, contextTags: ['baking', 'vegan'] },
      });
    });
  });

  it('Delete button fires the delete mutation', async () => {
    seedList([row({ id: 7 })]);
    renderTab();
    const row7 = await screen.findByTestId('sub-row-7');
    await userEvent.click(within(row7).getByRole('button', { name: /^delete$/i }));
    await waitFor(() => {
      expect(substitutionsDeleteMock).toHaveBeenCalledWith({ path: { id: 7 } });
    });
  });

  it('surfaces a duplicate error from create', async () => {
    seedList([]);
    slugsSearchMock.mockResolvedValue({
      data: { items: [{ kind: 'ingredient', name: 'Butter', slug: 'butter', targetId: 100 }] },
    });
    substitutionsCreateMock.mockResolvedValue({
      error: { message: 'already exists' },
      response: { status: 409 },
    });
    renderTab();

    const form = screen.getByRole('form', { name: /add substitution/i });
    const slugBoxes = within(form).getAllByPlaceholderText(/search slug/i);
    const fromBox = elementAt(slugBoxes, 0);
    const toBox = elementAt(slugBoxes, 1);
    await userEvent.type(fromBox, 'butter');
    // `Autocomplete`'s option list renders through a `Popover` portal, outside
    // `form`'s own DOM subtree, so the option itself has to be found globally.
    await userEvent.click(await screen.findByRole('option', { name: /butter/i }));
    await userEvent.type(toBox, 'butter');
    // `Autocomplete`'s option list renders through a `Popover` portal, outside
    // `form`'s own DOM subtree, so the option itself has to be found globally.
    await userEvent.click(await screen.findByRole('option', { name: /butter/i }));

    await userEvent.click(within(form).getByRole('button', { name: /^add$/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/already exists/i);
  });

  // POPS-3282: `EndpointPicker` has always rendered `<Label htmlFor={inputId}>`
  // and passed the same id to `Autocomplete`, and the association was silently
  // dead — the id never reached the input, and cmdk's empty hidden label won
  // the accessible-name computation, so both fields reached a screen reader
  // unnamed. Asserted through the name computation, not `getByLabelText`,
  // which matches an `aria-label` neither of these fields has.
  it('names each endpoint field from its own visible label', () => {
    seedList([]);
    renderTab();

    const form = screen.getByRole('form', { name: /add substitution/i });

    expect(within(form).getByRole('combobox', { name: 'From' })).toBeInTheDocument();
    expect(within(form).getByRole('combobox', { name: 'To' })).toBeInTheDocument();
  });

  // POPS-3179: the hand-rolled `IngredientSearch` declared `role="listbox"`
  // with `aria-selected={false}` hardcoded on every option and no keyboard
  // handling at all — a screen reader was told there was a listbox where no
  // option was ever selected, and Tab was the only way through it. Kit
  // `Autocomplete` (cmdk) must actually be operable by keyboard alone: this
  // fails against the old `IngredientSearch`, which never listened for
  // ArrowDown/Enter and would leave the field showing a raw text box with no
  // selection made.
  it('picks an ingredient search result by keyboard alone — arrow to it, Enter to choose', async () => {
    seedList([]);
    slugsSearchMock.mockResolvedValue({
      data: { items: [{ kind: 'ingredient', name: 'Butter', slug: 'butter', targetId: 100 }] },
    });
    renderTab();

    const form = screen.getByRole('form', { name: /add substitution/i });
    const fromBox = elementAt(within(form).getAllByPlaceholderText(/search slug/i), 0);

    await userEvent.type(fromBox, 'butter');
    await screen.findByRole('option', { name: /butter/i });

    await userEvent.keyboard('{ArrowDown}{Enter}');

    const selected = await screen.findByTestId('endpoint-picker-selected');
    expect(selected).toHaveTextContent('#100');
    expect(within(form).queryByPlaceholderText(/search slug/i)).toBeInTheDocument();
  });

  it('never declares role="listbox" with a hardcoded aria-selected', async () => {
    seedList([]);
    slugsSearchMock.mockResolvedValue({
      data: {
        items: [
          { kind: 'ingredient', name: 'Butter', slug: 'butter', targetId: 100 },
          { kind: 'ingredient', name: 'Buttermilk', slug: 'buttermilk', targetId: 101 },
        ],
      },
    });
    renderTab();

    const form = screen.getByRole('form', { name: /add substitution/i });
    const fromBox = elementAt(within(form).getAllByPlaceholderText(/search slug/i), 0);
    await userEvent.type(fromBox, 'butter');

    const listbox = await screen.findByRole('listbox');
    const options = await within(listbox).findAllByRole('option');
    expect(options).toHaveLength(2);
    const [butter, buttermilk] = options;
    // cmdk auto-highlights the first option on open, and `aria-selected`
    // tracks that live highlight rather than being a constant — proof that
    // it can move is proof it isn't hardcoded, the defect the old
    // `IngredientSearch` had.
    expect(butter).toHaveAttribute('aria-selected', 'true');
    expect(buttermilk).toHaveAttribute('aria-selected', 'false');

    await userEvent.keyboard('{ArrowDown}');

    expect(butter).toHaveAttribute('aria-selected', 'false');
    expect(buttermilk).toHaveAttribute('aria-selected', 'true');
  });

  it('filter scope=recipe reveals a recipeId filter input and includes it in the list query', async () => {
    seedList([]);
    renderTab();
    const scopeSelect = screen.getByLabelText(/^scope$/i, { selector: '#sub-filter-scope' });
    await userEvent.selectOptions(scopeSelect, 'recipe');
    const recipeFilter = screen.getByLabelText(/recipe id/i, { selector: '#sub-filter-recipe' });
    await userEvent.type(recipeFilter, '42');
    await waitFor(() => {
      const lastInput = substitutionsListHydratedMock.mock.lastCall?.[0]?.query as {
        scope?: string;
        recipeId?: number;
      };
      expect(lastInput.scope).toBe('recipe');
      expect(lastInput.recipeId).toBe(42);
    });
  });

  it('recipe-scope rows display the recipe slug', async () => {
    seedList([row({ id: 9, scope: 'recipe', recipeId: 42, recipeSlug: 'weeknight-pasta' })]);
    renderTab();
    expect(await screen.findByText(/recipe \(weeknight-pasta\)/i)).toBeInTheDocument();
  });
});
