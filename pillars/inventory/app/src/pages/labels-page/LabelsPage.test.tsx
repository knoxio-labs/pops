import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { decodeQrSvg } from '@pops/ui/testing/decode-qr';

const api = vi.hoisted(() => ({
  webList: vi.fn(),
  codesSuggest: vi.fn(),
  syncMutations: vi.fn(),
  searchSearch: vi.fn(),
}));

vi.mock('../../inventory-api/index.js', () => ({
  webList: (...args: unknown[]) => api.webList(...args),
  codesSuggest: (...args: unknown[]) => api.codesSuggest(...args),
  syncMutations: (...args: unknown[]) => api.syncMutations(...args),
  searchSearch: (...args: unknown[]) => api.searchSearch(...args),
}));

import { LabelsPage } from './LabelsPage';

interface FakeItem {
  id: string;
  name: string;
  code: string | null;
  isContainer: boolean;
  containingItemId: string | null;
  quantity: number;
  revision: number;
  typeKey: string | null;
}

const BOX = '8c1e4f2a-5b7d-4a9e-b3c6-000000000001';
const MACHINE = '8c1e4f2a-5b7d-4a9e-b3c6-000000000020';
const CUPS = '8c1e4f2a-5b7d-4a9e-b3c6-000000000021';
const JUG = '8c1e4f2a-5b7d-4a9e-b3c6-000000000022';
const GRINDER = '8c1e4f2a-5b7d-4a9e-b3c6-000000000030';

let items: Map<string, FakeItem>;

function item(id: string, name: string, code: string | null, extra: Partial<FakeItem> = {}) {
  return {
    id,
    name,
    code,
    isContainer: false,
    containingItemId: null,
    quantity: 1,
    revision: 1,
    typeKey: null,
    ...extra,
  };
}

function ok<T>(data: T) {
  return { data, error: undefined, response: { status: 200 } };
}

function mutationOutcome(body: {
  mutations: { mutationId: string; entityId: string; args: { code: string } }[];
}) {
  const [mutation] = body.mutations;
  if (!mutation) throw new Error('no mutation sent');
  const code = mutation.args.code;
  const holder = [...items.values()].find((held) => held.code === code);
  if (holder) {
    return {
      status: 'conflict',
      kind: 'code_collision',
      mutationId: mutation.mutationId,
      heldBy: { id: holder.id, name: holder.name },
      suggestedCode: 'KIT-032',
    };
  }
  const target = items.get(mutation.entityId);
  if (!target) throw new Error(`no item ${mutation.entityId}`);
  items.set(target.id, { ...target, code, revision: target.revision + 1 });
  return {
    status: 'applied',
    mutationId: mutation.mutationId,
    revision: 2,
    seq: 1,
    converged: true,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  items = new Map(
    [
      item(BOX, 'Kitchen 12', 'B412', { isContainer: true }),
      item(MACHINE, 'Espresso machine', 'BREW-2026-0007-A', { containingItemId: BOX }),
      item(CUPS, 'Coffee cups', null, { containingItemId: BOX, quantity: 6 }),
      item(JUG, 'Milk jug', 'KIT-033', { containingItemId: BOX }),
      item(GRINDER, 'Coffee grinder', 'KIT-031'),
    ].map((held) => [held.id, held])
  );
  api.webList.mockImplementation(
    async ({ query }: { query: { ids?: string; containingItemId?: string } }) => {
      const wanted = query.ids?.split(',');
      const listed = [...items.values()].filter((held) =>
        wanted ? wanted.includes(held.id) : held.containingItemId === query.containingItemId
      );
      return ok({ items: listed, nextCursor: null });
    }
  );
  api.codesSuggest.mockResolvedValue(ok({ suggestions: ['KIT-031'] }));
  api.syncMutations.mockImplementation(async ({ body }) =>
    ok({ outcomes: [mutationOutcome(body)] })
  );
  api.searchSearch.mockResolvedValue(ok({ hits: [] }));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function Address() {
  const location = useLocation();
  return <output data-testid="address">{location.search}</output>;
}

function renderPage(search: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/inventory/labels${search}`]}>
        <Routes>
          <Route
            path="/inventory/labels"
            element={
              <>
                <LabelsPage />
                <Address />
              </>
            }
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

function printedCodes(): string[] {
  return [...document.querySelectorAll('[data-slot-kind="label"] [data-code-pt]')].map(
    (node) => node.textContent ?? ''
  );
}

function addressIds(): string[] {
  const search = new URLSearchParams(screen.getByTestId('address').textContent ?? '');
  return (search.get('ids') ?? '').split(',').filter(Boolean);
}

describe('LabelsPage', () => {
  it('returns to the items page instead of the overview placeholder', () => {
    renderPage(`?ids=${GRINDER}`);
    expect(screen.getByRole('link', { name: 'Go back' })).toHaveAttribute(
      'href',
      '/inventory/items'
    );
    expect(screen.getByRole('link', { name: 'Items' })).toHaveAttribute('href', '/inventory/items');
  });

  it('loads the listed items by id and gives a box two labels, a thing one', async () => {
    renderPage(`?ids=${BOX},${GRINDER}`);
    expect(await screen.findByRole('button', { name: 'Print 3 labels' })).toBeEnabled();
    expect(api.webList).toHaveBeenCalledWith({ query: { ids: `${BOX},${GRINDER}`, limit: 200 } });
    expect(printedCodes()).toEqual(['B412', 'B412', 'KIT-031']);
    const labels = document.querySelectorAll('[data-slot-kind="label"]');
    expect(within(labels[0] as HTMLElement).queryByText('Kitchen 12')).not.toBeNull();
    expect(within(labels[2] as HTMLElement).queryByText('Coffee grinder')).toBeNull();
  });

  it('encodes each label as its item URI', async () => {
    renderPage(`?ids=${GRINDER}`);
    await screen.findByRole('button', { name: 'Print 1 label' });
    const qr = document.querySelector('[data-slot-kind="label"] svg');
    if (!(qr instanceof SVGElement)) throw new Error('no QR on the label');
    expect(decodeQrSvg(qr)).toBe(`pops://inventory/item/${GRINDER}`);
  });

  it('prints on A4 with no page margin', async () => {
    renderPage(`?ids=${GRINDER}`);
    await screen.findByRole('button', { name: 'Print 1 label' });
    const css = [...document.querySelectorAll('style')].map((node) => node.textContent).join('');
    expect(css).toContain('@page { size: A4 portrait; margin: 0; }');
    expect(document.querySelector('.pops-print-root .pops-print-sheet')).not.toBeNull();
  });

  it('prints a box with its contents when asked, writing them into the address', async () => {
    renderPage(`?ids=${BOX}&contents=1`);
    await waitFor(() => expect(addressIds()).toEqual([BOX, MACHINE, CUPS, JUG]));
    expect(screen.getByTestId('address').textContent).not.toContain('contents');
    expect(await screen.findByText('Coffee cups')).toBeInTheDocument();
    expect(api.webList).toHaveBeenCalledWith({ query: { containingItemId: BOX, limit: 200 } });
  });

  it("adds a box's contents from its row", async () => {
    renderPage(`?ids=${BOX}`);
    fireEvent.click(await screen.findByRole('button', { name: 'Add 3 inside' }));
    await waitFor(() => expect(addressIds()).toEqual([BOX, MACHINE, CUPS, JUG]));
  });

  it('removes an item from the job only', async () => {
    renderPage(`?ids=${BOX},${GRINDER}`);
    fireEvent.click(await screen.findByRole('button', { name: 'Remove Coffee grinder' }));
    await waitFor(() => expect(addressIds()).toEqual([BOX]));
    expect(api.syncMutations).not.toHaveBeenCalled();
  });

  it('says when a listed item no longer exists', async () => {
    renderPage(`?ids=${GRINDER},gone`);
    expect(await screen.findByText(/1 item was not found/)).toBeInTheDocument();
  });
});

describe('items without a code', () => {
  it('will not print until the item has a code', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => {});
    renderPage(`?ids=${CUPS}`);
    const button = await screen.findByRole('button', { name: 'Print 1 label' });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(print).not.toHaveBeenCalled();
    expect(screen.getByText('1 item needs a code before printing.')).toBeInTheDocument();
    expect(screen.getByText('Needs a code')).toBeInTheDocument();
  });

  it('will not print again after an uncoded item joins the job', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => {});
    renderPage(`?ids=${BOX}`);
    fireEvent.click(await screen.findByRole('button', { name: 'Print 2 labels' }));
    fireEvent.click(screen.getByRole('button', { name: 'No' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add 3 inside' }));
    await screen.findByText('1 item needs a code before printing.');
    fireEvent.click(screen.getByRole('button', { name: 'Print again' }));
    expect(print).toHaveBeenCalledOnce();
  });

  it('saves a suggested code through item.setCode, then prints', async () => {
    api.codesSuggest.mockResolvedValue(ok({ suggestions: ['KIT-040'] }));
    renderPage(`?ids=${CUPS}`);
    fireEvent.click(await screen.findByRole('button', { name: 'Add KIT-040' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Print 1 label' })).toBeEnabled()
    );
    expect(api.syncMutations.mock.calls[0]?.[0].body.mutations[0]).toMatchObject({
      op: 'item.setCode',
      entityId: CUPS,
      baseRevision: 1,
      args: { code: 'KIT-040' },
    });
    expect(printedCodes()).toEqual(['KIT-040']);
  });

  it('takes the next free code when the suggestion was taken meanwhile', async () => {
    renderPage(`?ids=${CUPS}`);
    fireEvent.click(await screen.findByRole('button', { name: 'Add KIT-031' }));
    await waitFor(() => expect(printedCodes()).toEqual(['KIT-032']));
    expect(api.syncMutations).toHaveBeenCalledTimes(2);
  });

  it('refuses a typed code another item holds, naming it', async () => {
    renderPage(`?ids=${CUPS}`);
    fireEvent.click(await screen.findByRole('button', { name: 'Type a code for Coffee cups' }));
    fireEvent.change(screen.getByLabelText('Code for Coffee cups'), {
      target: { value: 'kit-031' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save code' }));
    expect((await screen.findByRole('alert')).textContent).toContain(
      'KIT-031 is on Coffee grinder'
    );
    expect(screen.getByRole('button', { name: 'Print 1 label' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Use KIT-032' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save code' }));
    await waitFor(() => expect(printedCodes()).toEqual(['KIT-032']));
  });
});

describe('the sheet', () => {
  it('opens on the sheet named in the address', async () => {
    renderPage(`?ids=${GRINDER}&sheet=L7165`);
    await screen.findByRole('button', { name: 'Print 1 label' });
    expect(screen.getByLabelText('Sheet')).toHaveValue('L7165');
  });

  it('remembers where the next job starts once the labels printed', async () => {
    vi.spyOn(window, 'print').mockImplementation(() => {});
    const first = renderPage(`?ids=${BOX}&sheet=L7160`);
    fireEvent.click(await screen.findByRole('button', { name: 'Start at label 5' }));
    fireEvent.click(screen.getByRole('button', { name: 'Print 2 labels' }));
    fireEvent.click(screen.getByRole('button', { name: 'Yes, next starts at 7' }));
    first.unmount();
    renderPage(`?ids=${GRINDER}&sheet=L7160`);
    expect(await screen.findByText('1 label on 1 sheet, label 7')).toBeInTheDocument();
    expect(document.querySelectorAll('[data-slot-kind="used"]')).toHaveLength(6);
  });

  it('does not move the start when the labels did not print', async () => {
    vi.spyOn(window, 'print').mockImplementation(() => {});
    const first = renderPage(`?ids=${GRINDER}&sheet=L7160`);
    fireEvent.click(await screen.findByRole('button', { name: 'Print 1 label' }));
    fireEvent.click(screen.getByRole('button', { name: 'No' }));
    first.unmount();
    renderPage(`?ids=${GRINDER}&sheet=L7160`);
    expect(await screen.findByText('1 label on 1 sheet, label 1')).toBeInTheDocument();
  });
});
