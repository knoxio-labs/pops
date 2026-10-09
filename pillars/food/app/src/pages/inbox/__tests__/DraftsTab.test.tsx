import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createInstance } from 'i18next';
import { useMemo, useState, type ReactElement, type ReactNode } from 'react';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import enAUFood from '../../../locales/en-AU.json';

import type { InboxListData, InboxListResponses } from '../../../food-api/types.gen.js';

type InboxDraftRow = InboxListResponses[200]['items'][number];
type InboxListRequest = Pick<InboxListData, 'body'>;
type InboxListMockReply =
  | { data: InboxListResponses[200] }
  | {
      error: { code: string; message: string; requestId: string; retryable: boolean };
      response: { status: number };
    };

const inboxListMock = vi.hoisted(() =>
  vi.fn<(request: InboxListRequest) => Promise<InboxListMockReply>>()
);

vi.mock('../../../food-api/index.js', () => ({
  inboxList: inboxListMock,
}));

import { DEFAULT_DRAFTS_FILTERS, type DraftsFiltersState } from '../drafts-filters.js';
import { DraftsTab } from '../DraftsTab.js';
import { useDraftsTab } from '../useDraftsTab.js';

function makeRow(over: Partial<InboxDraftRow> = {}): InboxDraftRow {
  return {
    sourceId: 7,
    versionId: 11,
    recipeSlug: 'banana-pancakes',
    title: 'Banana pancakes',
    recipeType: 'plate',
    ingestKind: 'url-web',
    sourceUrl: 'https://example.com/banana-pancakes',
    ingestedAt: '2026-06-10 16:00:00',
    qualityBand: 'minor',
    qualityScore: 72,
    topSignals: [{ code: 'NO_YIELD', weight: -15 }],
    proposedSlugCount: 1,
    creationCount: 2,
    compileStatus: 'compiled',
    ...over,
  };
}

function mockList(items: InboxDraftRow[], nextCursor: string | null = null): void {
  inboxListMock.mockResolvedValue({ data: { items, nextCursor } });
}

function lastBody(): NonNullable<InboxListRequest['body']> {
  const call = inboxListMock.mock.calls.at(-1);
  if (call === undefined) throw new Error('inboxList was not called');
  const body = call[0].body;
  if (body === undefined) throw new Error('inboxList body was not provided');
  return body;
}

function requestBody(request: InboxListRequest): NonNullable<InboxListRequest['body']> {
  if (request.body === undefined) throw new Error('inboxList body was not provided');
  return request.body;
}

function StatefulHost({ now }: { now: Date }): ReactElement {
  const [filters, setFilters] = useState<DraftsFiltersState>(DEFAULT_DRAFTS_FILTERS);
  return <DraftsTab filters={filters} onFiltersChange={setFilters} now={now} />;
}

function Wrapper({
  children,
  client: providedClient,
}: {
  children: ReactNode;
  client?: QueryClient;
}): ReactElement {
  const i18n = useMemo(() => {
    const instance = createInstance();
    void instance.use(initReactI18next).init({
      lng: 'en-AU',
      fallbackLng: 'en-AU',
      ns: ['food'],
      defaultNS: 'food',
      interpolation: { escapeValue: false },
      resources: { 'en-AU': { food: enAUFood } },
    });
    return instance;
  }, []);
  const client = useMemo(
    () => providedClient ?? new QueryClient({ defaultOptions: { queries: { retry: false } } }),
    [providedClient]
  );
  return (
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>
        <MemoryRouter>{children}</MemoryRouter>
      </I18nextProvider>
    </QueryClientProvider>
  );
}

const FIXED_NOW = new Date('2026-06-10T18:00:00Z');

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  mockList([]);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('DraftsTab', () => {
  it('renders one row per item including band pill, title, age, sub-line', async () => {
    mockList([makeRow(), makeRow({ versionId: 12, title: 'Lentil dahl', qualityBand: 'clean' })]);
    render(
      <Wrapper>
        <StatefulHost now={FIXED_NOW} />
      </Wrapper>
    );
    expect(await screen.findByText('Banana pancakes')).toBeInTheDocument();
    expect(screen.getByText('Lentil dahl')).toBeInTheDocument();
    const bands = screen.getAllByTestId('quality-band-badge');
    expect(bands).toHaveLength(2);
    expect(bands.map((b) => b.getAttribute('data-band')).toSorted()).toEqual(['clean', 'minor']);
  });

  it('reveals the top quality signals when the band is tapped', async () => {
    mockList([makeRow()]);
    render(
      <Wrapper>
        <StatefulHost now={FIXED_NOW} />
      </Wrapper>
    );
    const badge = await screen.findByTestId('quality-band-badge');
    expect(badge).toHaveAttribute('aria-expanded', 'false');
    await userEvent.setup().click(badge);
    expect(await screen.findByText('NO_YIELD')).toBeVisible();
  });

  it('shows the "<no title>" placeholder when the row has no title', async () => {
    mockList([makeRow({ title: null })]);
    render(
      <Wrapper>
        <StatefulHost now={FIXED_NOW} />
      </Wrapper>
    );
    expect(await screen.findByText('<no title>')).toBeInTheDocument();
  });

  it('shows the partialReason banner when set', async () => {
    mockList([makeRow({ partialReason: 'auth-dead' })]);
    render(
      <Wrapper>
        <StatefulHost now={FIXED_NOW} />
      </Wrapper>
    );
    const note = await screen.findByRole('note');
    expect(note.textContent).toMatch(/Instagram cookies expired/i);
  });

  it('shows the "Inbox is empty" copy when nothing pending and no filters changed', async () => {
    mockList([]);
    render(
      <Wrapper>
        <StatefulHost now={FIXED_NOW} />
      </Wrapper>
    );
    expect(await screen.findByText(/Inbox is empty/i)).toBeInTheDocument();
    expect(screen.queryByTestId('drafts-clear-filters')).not.toBeInTheDocument();
  });

  it('shows the filtered-empty state + Clear-filters link when filters narrow to []', async () => {
    mockList([]);
    render(
      <Wrapper>
        <StatefulHost now={FIXED_NOW} />
      </Wrapper>
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Web URL' }));
    expect(await screen.findByText(/No drafts match your filters/i)).toBeInTheDocument();
    expect(screen.getByTestId('drafts-clear-filters')).toBeInTheDocument();
  });

  it('passes band toggles into the query input', async () => {
    mockList([]);
    render(
      <Wrapper>
        <StatefulHost now={FIXED_NOW} />
      </Wrapper>
    );
    const user = userEvent.setup();
    // All bands selected collapses to `undefined` on the wire; dropping one ships the array.
    await user.click(screen.getByRole('button', { name: 'Clean' }));
    await vi.waitFor(() => {
      expect(Array.isArray(lastBody().bands)).toBe(true);
    });
    expect(lastBody().bands).not.toContain('clean');
  });

  it('passes freshOnly toggle into the query input', async () => {
    mockList([]);
    render(
      <Wrapper>
        <StatefulHost now={FIXED_NOW} />
      </Wrapper>
    );
    const user = userEvent.setup();
    await user.click(screen.getByTestId('drafts-freshonly'));
    await vi.waitFor(() => {
      expect(lastBody().freshOnly).toBe(true);
    });
  });

  it('passes sort dropdown into the query input', async () => {
    mockList([]);
    render(
      <Wrapper>
        <StatefulHost now={FIXED_NOW} />
      </Wrapper>
    );
    const user = userEvent.setup();
    await user.selectOptions(screen.getByTestId('drafts-sort'), 'newest');
    await vi.waitFor(() => {
      expect(lastBody().sort).toBe('newest');
    });
  });

  it('traverses 500 blocked drafts in 20-item cursor pages', async () => {
    const requestBodies: NonNullable<InboxListRequest['body']>[] = [];
    inboxListMock.mockImplementation(async (request) => {
      const body = requestBody(request);
      requestBodies.push(body);
      const pageIndex = body.cursor === undefined ? 0 : Number(body.cursor.slice('cursor-'.length));
      const start = pageIndex * 20;
      const items = Array.from({ length: 20 }, (_, index) =>
        makeRow({
          versionId: start + index + 1,
          title: `Blocked draft ${start + index + 1}`,
          qualityBand: 'blocked',
        })
      );
      return {
        data: {
          items,
          nextCursor: pageIndex < 24 ? `cursor-${pageIndex + 1}` : null,
        },
      };
    });

    const { result } = renderHook(() => useDraftsTab({ filters: DEFAULT_DRAFTS_FILTERS }), {
      wrapper: Wrapper,
    });
    await waitFor(() => {
      expect(result.current.rows).toHaveLength(20);
    });

    for (let pageIndex = 1; pageIndex < 25; pageIndex += 1) {
      await act(async () => {
        result.current.fetchNextPage();
      });
      await waitFor(() => {
        expect(result.current.rows).toHaveLength((pageIndex + 1) * 20);
      });
    }

    expect(result.current.rows).toHaveLength(500);
    expect(requestBodies).toHaveLength(25);
    expect(requestBodies.map((body) => body.cursor ?? null)).toEqual([
      null,
      ...Array.from({ length: 24 }, (_, index) => `cursor-${index + 1}`),
    ]);
    expect(requestBodies.every((body) => body.limit === 20)).toBe(true);
  }, 30_000);

  it('resets pages and scroll position when filters or sort change', async () => {
    const requestBodies: NonNullable<InboxListRequest['body']>[] = [];
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    inboxListMock.mockImplementation(async (request) => {
      const body = requestBody(request);
      requestBodies.push(body);
      if (body.sort === 'newest') {
        return {
          data: { items: [makeRow({ versionId: 5, title: 'Sorted draft' })], nextCursor: null },
        };
      }
      if (body.kinds?.includes('url-web')) {
        return body.cursor === undefined
          ? {
              data: {
                items: [makeRow({ versionId: 3, title: 'Filtered draft one' })],
                nextCursor: 'filtered-cursor',
              },
            }
          : {
              data: {
                items: [makeRow({ versionId: 4, title: 'Filtered draft two' })],
                nextCursor: null,
              },
            };
      }
      return body.cursor === undefined
        ? {
            data: {
              items: [makeRow({ versionId: 1, title: 'Default draft one' })],
              nextCursor: 'default-cursor',
            },
          }
        : {
            data: {
              items: [makeRow({ versionId: 2, title: 'Default draft two' })],
              nextCursor: null,
            },
          };
    });

    render(
      <Wrapper>
        <StatefulHost now={FIXED_NOW} />
      </Wrapper>
    );
    const user = userEvent.setup();
    expect(await screen.findByText('Default draft one')).toBeInTheDocument();
    await user.click(await screen.findByRole('button', { name: 'Load more drafts' }));
    expect(await screen.findByText('Default draft two')).toBeInTheDocument();

    scrollTo.mockClear();
    await user.click(screen.getByRole('button', { name: 'Web URL' }));
    expect(await screen.findByText('Filtered draft one')).toBeInTheDocument();
    expect(screen.queryByText('Default draft one')).not.toBeInTheDocument();
    expect(screen.queryByText('Default draft two')).not.toBeInTheDocument();
    expect(lastBody().cursor).toBeUndefined();
    expect(lastBody().kinds).toEqual(['url-web']);
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 0, behavior: 'auto' });

    await user.click(await screen.findByRole('button', { name: 'Load more drafts' }));
    expect(await screen.findByText('Filtered draft two')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Load more drafts' })).not.toBeInTheDocument();
    scrollTo.mockClear();
    await user.selectOptions(screen.getByTestId('drafts-sort'), 'newest');
    expect(await screen.findByText('Sorted draft')).toBeInTheDocument();
    expect(screen.queryByText('Filtered draft one')).not.toBeInTheDocument();
    expect(screen.queryByText('Filtered draft two')).not.toBeInTheDocument();
    expect(lastBody().cursor).toBeUndefined();
    expect(lastBody().sort).toBe('newest');
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 0, behavior: 'auto' });

    scrollTo.mockClear();
    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(await screen.findByText('Default draft one')).toBeInTheDocument();
    expect(screen.queryByText('Default draft two')).not.toBeInTheDocument();
    expect(lastBody().cursor).toBeUndefined();
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 0, behavior: 'auto' });
    expect(requestBodies.at(-1)?.limit).toBe(20);
  });

  it('refreshes every loaded page on the 60-second poll without resetting scroll', async () => {
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    vi.useFakeTimers();
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    const requestBodies: NonNullable<InboxListRequest['body']>[] = [];
    const responseTitles: string[] = [];
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    let refreshed = false;
    inboxListMock.mockImplementation(async (request) => {
      const body = requestBody(request);
      requestBodies.push(body);
      const secondPage = body.cursor === 'poll-cursor';
      const pageNumber = secondPage ? 2 : 1;
      const title = `${secondPage ? 'Second' : 'First'} ${refreshed ? 'refreshed' : 'initial'}`;
      responseTitles.push(title);
      return {
        data: {
          items: [
            makeRow({
              versionId: pageNumber,
              title,
            }),
          ],
          nextCursor: secondPage ? null : 'poll-cursor',
        },
      };
    });

    render(
      <Wrapper client={queryClient}>
        <StatefulHost now={FIXED_NOW} />
      </Wrapper>
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByText('First initial')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Load more drafts' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByText('Second initial')).toBeInTheDocument();

    scrollTo.mockClear();
    refreshed = true;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    await act(async () => {
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(1);
    });

    expect(requestBodies).toHaveLength(4);
    expect(responseTitles).toEqual([
      'First initial',
      'Second initial',
      'First refreshed',
      'Second refreshed',
    ]);
    expect(queryClient?.getQueryCache().getAll()[0]?.state.data).toMatchObject({
      pages: [
        { items: [{ title: 'First refreshed' }] },
        { items: [{ title: 'Second refreshed' }] },
      ],
    });
    expect(screen.getAllByTestId('draft-row').map((row) => row.textContent)).toEqual([
      expect.stringContaining('First refreshed'),
      expect.stringContaining('Second refreshed'),
    ]);
    expect(requestBodies.slice(2).map((body) => body.cursor ?? null)).toEqual([
      null,
      'poll-cursor',
    ]);
    expect(scrollTo).not.toHaveBeenCalled();
  }, 15_000);

  it('renders the kind chip as a link with target=_blank for url-* rows', async () => {
    mockList([makeRow({ ingestKind: 'url-web' })]);
    render(
      <Wrapper>
        <StatefulHost now={FIXED_NOW} />
      </Wrapper>
    );
    const chip = await screen.findByTestId('draft-row-kind-link');
    expect(chip.getAttribute('href')).toBe('https://example.com/banana-pancakes');
    expect(chip.getAttribute('target')).toBe('_blank');
    expect(chip.getAttribute('rel')).toMatch(/noopener/);
    expect(chip.getAttribute('rel')).toMatch(/noreferrer/);
  });

  it('renders the kind chip as a preview button for text rows', async () => {
    mockList([makeRow({ ingestKind: 'text', sourceUrl: null })]);
    render(
      <Wrapper>
        <StatefulHost now={FIXED_NOW} />
      </Wrapper>
    );
    const user = userEvent.setup();
    const chip = await screen.findByTestId('draft-row-kind-preview');
    await user.click(chip);
    expect(screen.getByTestId('view-source-dialog')).toBeInTheDocument();
    expect(
      within(screen.getByTestId('view-source-dialog')).getByText(/Open the inspector view/i)
    ).toBeInTheDocument();
  });

  it('links the row card to /food/inbox/:sourceId', async () => {
    mockList([makeRow()]);
    render(
      <Wrapper>
        <StatefulHost now={FIXED_NOW} />
      </Wrapper>
    );
    const card = await screen.findByTestId('draft-row');
    const link = within(card).getByRole('link', { name: /Open inspector/i });
    expect(link.getAttribute('href')).toBe('/food/inbox/7');
  });

  it('surfaces a loading state', () => {
    inboxListMock.mockReturnValue(new Promise(() => {}));
    render(
      <Wrapper>
        <StatefulHost now={FIXED_NOW} />
      </Wrapper>
    );
    expect(screen.getByText(/Loading drafts/i)).toBeInTheDocument();
  });

  it('surfaces an error state', async () => {
    inboxListMock.mockResolvedValue({
      error: {
        code: 'food.inbox.drafts_unavailable',
        message: 'Drafts unavailable',
        requestId: 'req-drafts',
        retryable: true,
      },
      response: { status: 503 },
    });
    render(
      <Wrapper>
        <StatefulHost now={FIXED_NOW} />
      </Wrapper>
    );
    expect(await screen.findByLabelText('Error code')).toHaveTextContent(
      'food.inbox.drafts_unavailable'
    );
  });
});
