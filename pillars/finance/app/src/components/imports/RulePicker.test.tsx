/**
 * This picker's only job is finding a rule that already exists, and it filters
 * client-side — so a single server page made "No matching rules." a statement
 * about an arbitrary confidence-ranked slice rather than about the rule set
 * (POPS-2696's sibling, POPS-2697). What falls outside a confidence-ordered
 * window is the newly-added and deliberately low-confidence rules: exactly the
 * ones someone opens this control to find.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { RulePicker } from './RulePicker';

import type { Correction } from '@pops/finance';

const mockCorrectionsList = vi.fn();

vi.mock('../../finance-api/index.js', () => ({
  correctionsList: (...args: unknown[]) => mockCorrectionsList(...args),
}));

function rule(id: string, pattern: string): Correction {
  return {
    id,
    descriptionPattern: pattern,
    accountId: null,
    matchType: 'contains',
    entityId: null,
    entityName: null,
    location: null,
    tags: [],
    transactionType: null,
    isActive: true,
    priority: 0,
    confidence: 0.5,
    timesApplied: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    lastUsedAt: null,
  };
}

/**
 * Page one reports more; the sought rule is only on page two. The pages are
 * kept small deliberately — `hasMore` is what drives the paging, and rendering
 * a realistically-sized first page would only make every keystroke in these
 * tests re-filter hundreds of rows.
 */
const FIRST_PAGE_SIZE = 3;

function servesTwoPages() {
  const firstPage = Array.from({ length: FIRST_PAGE_SIZE }, (_, i) =>
    rule(`bulk-${i}`, `BULK ${i}`)
  );
  const secondPage = [rule('sought', 'SAUNA X DARLINGHURST')];
  const total = FIRST_PAGE_SIZE + 1;
  mockCorrectionsList.mockImplementation(({ query }: { query: { offset: number } }) =>
    Promise.resolve({
      data:
        query.offset === 0
          ? { data: firstPage, pagination: { total, limit: 500, offset: 0, hasMore: true } }
          : {
              data: secondPage,
              pagination: { total, limit: 500, offset: FIRST_PAGE_SIZE, hasMore: false },
            },
      error: undefined,
    })
  );
}

function renderPicker(ui?: Partial<Parameters<typeof RulePicker>[0]>): ReactElement {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <RulePicker value={null} onChange={vi.fn()} {...ui} />
    </QueryClientProvider>
  );
  return <></>;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('RulePicker — searching the rule set, not a page of it', () => {
  it('finds a rule that lives past the first page', async () => {
    const user = userEvent.setup();
    servesTwoPages();
    renderPicker();

    await user.click(screen.getByRole('combobox'));
    await waitFor(() => expect(mockCorrectionsList).toHaveBeenCalledTimes(2));
    await user.type(screen.getByPlaceholderText(/search rules/i), 'SAUNA');

    expect(await screen.findByText('SAUNA X DARLINGHURST')).toBeInTheDocument();
    expect(screen.queryByText('No matching rules.')).not.toBeInTheDocument();
  });

  it('keeps paging until the server says there is no more', async () => {
    const user = userEvent.setup();
    servesTwoPages();
    renderPicker();

    await user.click(screen.getByRole('combobox'));

    await waitFor(() => expect(mockCorrectionsList).toHaveBeenCalledTimes(2));
    expect(mockCorrectionsList).toHaveBeenNthCalledWith(2, {
      query: { limit: 500, offset: FIRST_PAGE_SIZE },
    });
  });

  it('opens on click — the trigger must carry the handlers PopoverTrigger merges onto it', async () => {
    const user = userEvent.setup();
    servesTwoPages();
    renderPicker();

    const trigger = screen.getByRole('combobox');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    await user.click(trigger);

    expect(await screen.findByPlaceholderText(/search rules/i)).toBeInTheDocument();
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
  });

  it('fetches nothing until the popover is opened', () => {
    servesTwoPages();
    renderPicker();

    expect(mockCorrectionsList).not.toHaveBeenCalled();
  });

  it('still says so when the rule genuinely is not there', async () => {
    const user = userEvent.setup();
    servesTwoPages();
    renderPicker();

    await user.click(screen.getByRole('combobox'));
    await waitFor(() => expect(mockCorrectionsList).toHaveBeenCalledTimes(2));
    await user.type(screen.getByPlaceholderText(/search rules/i), 'NOTHING LIKE THIS');

    expect(await screen.findByText('No matching rules.')).toBeInTheDocument();
  });
});
