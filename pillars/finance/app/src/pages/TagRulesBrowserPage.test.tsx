import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ReactNode } from 'react';

const tagRulesList = vi.fn();
const tagRulesGet = vi.fn();
const tagRulesUpdate = vi.fn();
const tagRulesDisable = vi.fn();
const tagRulesDelete = vi.fn();
const tagRulesMatchPreview = vi.fn();

vi.mock('../finance-api/index.js', () => ({
  tagRulesList: (...a: unknown[]) => tagRulesList(...a),
  tagRulesGet: (...a: unknown[]) => tagRulesGet(...a),
  tagRulesUpdate: (...a: unknown[]) => tagRulesUpdate(...a),
  tagRulesDisable: (...a: unknown[]) => tagRulesDisable(...a),
  tagRulesDelete: (...a: unknown[]) => tagRulesDelete(...a),
  tagRulesMatchPreview: (...a: unknown[]) => tagRulesMatchPreview(...a),
}));

vi.mock('../contacts-api/index.js', () => ({
  entitiesList: () =>
    Promise.resolve({
      data: {
        data: [
          { id: 'ent-1', name: 'Woolworths' },
          { id: 'ent-3', name: 'Uber Eats' },
        ],
        pagination: { total: 2, limit: 500, offset: 0, hasMore: false },
      },
      error: undefined,
    }),
}));

vi.mock('@pops/ui', async () => {
  const React = await import('react');
  let dialogCloseRef: (() => void) | null = null;
  return {
    PageHeader: ({
      title,
      description,
    }: {
      title: React.ReactNode;
      description?: React.ReactNode;
    }) =>
      React.createElement(
        'div',
        { 'data-testid': 'page-header' },
        React.createElement('h1', null, title),
        description && React.createElement('p', null, description)
      ),
    DataTable: ({
      columns,
      data,
    }: {
      columns: { id?: string; accessorKey?: string; header: unknown; cell: unknown }[];
      data: unknown[];
    }) =>
      React.createElement(
        'table',
        { 'data-testid': 'data-table' },
        React.createElement(
          'thead',
          null,
          React.createElement(
            'tr',
            null,
            columns.map((col, i) => {
              const key = col.id ?? col.accessorKey ?? `col-${i}`;
              const header =
                typeof col.header === 'function'
                  ? col.header({ column: { getIsSorted: () => false, toggleSorting: vi.fn() } })
                  : col.header;
              return React.createElement('th', { key }, header);
            })
          )
        ),
        React.createElement(
          'tbody',
          null,
          (data as Record<string, unknown>[]).map((row, ri) =>
            React.createElement(
              'tr',
              { key: ri, 'data-testid': `row-${ri}` },
              columns.map((col, ci) => {
                const key = col.id ?? col.accessorKey ?? `cell-${ci}`;
                const cell =
                  typeof col.cell === 'function' ? col.cell({ row: { original: row } }) : null;
                return React.createElement('td', { key }, cell);
              })
            )
          )
        )
      ),
    SortableHeader: ({ children }: { children: React.ReactNode; column: unknown }) =>
      React.createElement('span', null, children),
    Skeleton: ({ className }: { className?: string }) =>
      React.createElement('div', { className: `animate-pulse ${className ?? ''}` }),
    Alert: ({ children, variant }: { children: React.ReactNode; variant?: string }) =>
      React.createElement('div', { role: 'alert', 'data-variant': variant }, children),
    Badge: ({ children }: { children: React.ReactNode; variant?: string }) =>
      React.createElement('span', { 'data-testid': 'badge' }, children),
    Chip: ({ children }: { children: React.ReactNode }) =>
      React.createElement('span', { 'data-testid': 'chip' }, children),
    hashToColor: () => ({}),
    Button: ({ children, onClick, disabled, variant, ...rest }: Record<string, unknown>) =>
      React.createElement(
        'button',
        { onClick: onClick as () => void, disabled, 'data-variant': variant, ...rest },
        children as React.ReactNode
      ),
    TextInput: ({ value, onChange, placeholder, ...rest }: Record<string, unknown>) =>
      React.createElement('input', {
        value: value as string,
        onChange: onChange as () => void,
        placeholder: placeholder as string,
        ...rest,
      }),
    Select: ({
      value,
      onChange,
      options,
      placeholder,
    }: {
      value: string;
      onChange: (e: { target: { value: string } }) => void;
      options: { value: string; label: string }[];
      placeholder?: string;
    }) =>
      React.createElement(
        'select',
        { value, onChange, 'aria-label': placeholder },
        options.map((opt) =>
          React.createElement('option', { key: opt.value, value: opt.value }, opt.label)
        )
      ),
    EmptyState: ({
      title,
      description,
    }: {
      title: React.ReactNode;
      description?: React.ReactNode;
    }) =>
      React.createElement(
        'div',
        null,
        React.createElement('p', null, title),
        description && React.createElement('p', null, description)
      ),
    EntitySelect: ({
      entities,
      value,
      onChange,
    }: {
      entities: { id: string; name: string }[];
      value?: string;
      onChange?: (id: string, name: string) => void;
    }) =>
      React.createElement(
        'select',
        {
          'aria-label': 'Entity',
          value: value ?? '',
          onChange: (e: React.ChangeEvent<HTMLSelectElement>) => {
            const found = entities.find((en) => en.id === e.target.value);
            onChange?.(e.target.value, found?.name ?? '');
          },
        },
        entities.map((en) => React.createElement('option', { key: en.id, value: en.id }, en.name))
      ),
    Dialog: ({
      children,
      open,
      onOpenChange,
    }: {
      children: React.ReactNode;
      open: boolean;
      onOpenChange: (v: boolean) => void;
    }) => {
      if (open) {
        dialogCloseRef = () => onOpenChange(false);
      }
      return open
        ? React.createElement(
            'div',
            {
              role: 'dialog',
              'aria-modal': 'true',
              'data-open': open,
              onClick: (e: React.MouseEvent) => {
                if (e.target === e.currentTarget) onOpenChange(false);
              },
            },
            children
          )
        : null;
    },
    DialogContent: ({ children }: { children: React.ReactNode; showCloseButton?: boolean }) =>
      React.createElement('div', { 'data-testid': 'dialog-content' }, children),
    DialogHeader: ({ children }: { children: React.ReactNode }) =>
      React.createElement('div', null, children),
    DialogTitle: ({ children }: { children: React.ReactNode }) =>
      React.createElement('h3', null, children),
    DialogDescription: ({ children }: { children: React.ReactNode }) =>
      React.createElement('p', null, children),
    DialogFooter: ({ children }: { children: React.ReactNode }) =>
      React.createElement('div', null, children),
    DialogClose: ({ children, asChild }: { children: React.ReactNode; asChild?: boolean }) => {
      if (asChild) {
        const child = children as React.ReactElement;
        return React.cloneElement(child, {
          onClick: (...args: unknown[]) => {
            dialogCloseRef?.();
            const onClick = (child.props as Record<string, (...a: unknown[]) => void>).onClick;
            onClick?.(...args);
          },
        } as Record<string, unknown>);
      }
      return React.createElement('button', { onClick: () => dialogCloseRef?.() }, children);
    },
    Slider: ({
      value,
      onValueChange,
      min = 0,
      max = 1,
      step = 0.01,
      className,
      ...rest
    }: {
      value?: number[];
      onValueChange?: (values: number[]) => void;
      min?: number;
      max?: number;
      step?: number;
      className?: string;
      'aria-label'?: string;
    }) =>
      React.createElement('input', {
        type: 'range',
        min,
        max,
        step,
        value: value?.[0] ?? min,
        className,
        onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
          onValueChange?.([parseFloat(e.target.value)]);
        },
        ...rest,
      }),
    formatDate: (dateStr: string) => new Date(dateStr).toLocaleDateString(),
    Label: ({ children }: { children: React.ReactNode }) =>
      React.createElement('label', null, children),
    ChipInput: ({
      value,
      onChange,
      placeholder,
    }: {
      value?: string[];
      onChange?: (next: string[]) => void;
      placeholder?: string;
    }) =>
      React.createElement('input', {
        'data-testid': 'chip-input',
        placeholder,
        value: (value ?? []).join(','),
        onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
          onChange?.(e.target.value ? e.target.value.split(',') : []),
      }),
    CheckboxInput: ({
      checked,
      onCheckedChange,
      label,
    }: {
      checked?: boolean;
      onCheckedChange?: (next: boolean) => void;
      label?: React.ReactNode;
    }) =>
      React.createElement(
        'label',
        null,
        React.createElement('input', {
          type: 'checkbox',
          checked: !!checked,
          onChange: (e: React.ChangeEvent<HTMLInputElement>) => onCheckedChange?.(e.target.checked),
          'aria-label': typeof label === 'string' ? label : undefined,
        }),
        label as React.ReactNode
      ),
    NumberInput: ({
      value,
      onChange,
      ...rest
    }: {
      value?: number;
      onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
      'aria-label'?: string;
    }) =>
      React.createElement('input', {
        type: 'number',
        value: value ?? 0,
        onChange,
        ...rest,
      }),
  };
});

import { TagRulesBrowserPage } from './TagRulesBrowserPage';

const mockRules = [
  {
    id: 'rule-1',
    descriptionPattern: 'WOOLWORTHS',
    matchType: 'contains' as const,
    entityId: 'ent-1',
    tags: ['contains:groceries'],
    confidence: 0.95,
    priority: 0,
    timesApplied: 42,
    lastUsedAt: '2026-03-25T00:00:00Z',
    createdAt: '2026-01-01T00:00:00Z',
    isActive: true,
  },
  {
    id: 'rule-2',
    descriptionPattern: 'NETFLIX.COM',
    matchType: 'exact' as const,
    entityId: null,
    tags: ['subscriptions', 'entertainment'],
    confidence: 0.72,
    priority: 0,
    timesApplied: 8,
    lastUsedAt: null,
    createdAt: '2026-02-15T00:00:00Z',
    isActive: true,
  },
];

const ok = (data: unknown) => ({ data });

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<TagRulesBrowserPage />, {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  tagRulesList.mockResolvedValue(
    ok({ data: mockRules, pagination: { total: 2, limit: 50, offset: 0 } })
  );
  tagRulesUpdate.mockResolvedValue(ok({ data: mockRules[0], message: 'Tag rule updated' }));
  tagRulesDisable.mockResolvedValue(ok({ message: 'Tag rule disabled' }));
  tagRulesDelete.mockResolvedValue(ok({ message: 'Tag rule deleted' }));
  tagRulesMatchPreview.mockResolvedValue(ok({ data: { matches: [], totalCount: 0 } }));
});

describe('TagRulesBrowserPage', () => {
  it('renders page title and description', async () => {
    renderPage();
    expect(await screen.findByText('Tag Rules')).toBeInTheDocument();
    expect(screen.getByText('Browse and manage tag-suggestion rules')).toBeInTheDocument();
  });

  it('renders rule patterns, match types, and tags in the table', async () => {
    renderPage();
    expect(await screen.findByText('WOOLWORTHS')).toBeInTheDocument();
    expect(screen.getByText('NETFLIX.COM')).toBeInTheDocument();
    expect(screen.getByText('contains')).toBeInTheDocument();
    expect(screen.getByText('exact')).toBeInTheDocument();
    // A faceted tag shows its value only; a legacy unprefixed one still shows.
    expect(screen.getByText('Groceries')).toBeInTheDocument();
    expect(screen.queryByText('contains:groceries')).toBeNull();
    expect(screen.getByText('Subscriptions')).toBeInTheDocument();
  });

  it('resolves entity names for a scoped rule and shows Global for a null entity', async () => {
    renderPage();
    expect(await screen.findByText('Woolworths')).toBeInTheDocument();
    expect(screen.getByText('Global')).toBeInTheDocument();
  });

  it('renders confidence, priority, and usage telemetry', async () => {
    renderPage();
    await screen.findByText('WOOLWORTHS');
    expect(screen.getByText('95%')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByText('Never')).toBeInTheDocument();
  });

  it('shows loading skeleton', () => {
    tagRulesList.mockReturnValue(new Promise(() => undefined));
    renderPage();
    expect(document.querySelector('.animate-pulse')).toBeInTheDocument();
  });

  it('shows error state with retry', async () => {
    tagRulesList.mockRejectedValue(new Error('boom'));
    renderPage();
    expect(await screen.findByText('Failed to load tag rules')).toBeInTheDocument();
    expect(screen.getByText('Retry')).toBeInTheDocument();
  });

  it('shows empty state when no rules', async () => {
    tagRulesList.mockResolvedValue(
      ok({ data: [], pagination: { total: 0, limit: 50, offset: 0 } })
    );
    renderPage();
    expect(await screen.findByText('No tag rules found.')).toBeInTheDocument();
  });

  it('passes the matchType filter to the server query', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('WOOLWORTHS');
    const [matchTypeSelect] = screen.getAllByRole('combobox');
    await user.selectOptions(matchTypeSelect!, 'exact');
    await waitFor(() => {
      const lastCall = tagRulesList.mock.calls.at(-1);
      expect(lastCall![0]).toMatchObject({ query: { matchType: 'exact' } });
    });
    expect(await screen.findByText('Clear filters')).toBeInTheDocument();
  });

  it('passes the isActive filter to the server query', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('WOOLWORTHS');
    const [, isActiveSelect] = screen.getAllByRole('combobox');
    await user.selectOptions(isActiveSelect!, 'false');
    await waitFor(() => {
      const lastCall = tagRulesList.mock.calls.at(-1);
      expect(lastCall![0]).toMatchObject({ query: { isActive: 'false' } });
    });
    expect(await screen.findByText('Clear filters')).toBeInTheDocument();
  });

  it('disables a rule as a direct real mutation (no confirm dialog)', async () => {
    const user = userEvent.setup();
    renderPage();
    const disableButtons = await screen.findAllByRole('button', { name: /disable tag rule/i });
    await user.click(disableButtons[0]!);
    await waitFor(() => expect(tagRulesDisable).toHaveBeenCalledWith({ path: { id: 'rule-1' } }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens delete confirmation dialog, cancels, then confirms', async () => {
    const user = userEvent.setup();
    renderPage();
    const deleteButtons = await screen.findAllByRole('button', { name: /delete tag rule/i });
    await user.click(deleteButtons[0]!);
    expect(screen.getByText('Delete Tag Rule')).toBeInTheDocument();

    await user.click(screen.getByText('Cancel'));
    expect(screen.queryByText('Delete Tag Rule')).not.toBeInTheDocument();
    expect(tagRulesDelete).not.toHaveBeenCalled();

    await user.click(deleteButtons[0]!);
    await user.click(screen.getByText('Delete'));
    await waitFor(() => expect(tagRulesDelete).toHaveBeenCalledWith({ path: { id: 'rule-1' } }));
  });

  it('opens the edit dialog prefilled, fetches a usage preview, and submits an update', async () => {
    const user = userEvent.setup();
    renderPage();
    const editButtons = await screen.findAllByRole('button', { name: /edit tag rule/i });
    await user.click(editButtons[0]!);

    expect(screen.getByText('Edit Tag Rule')).toBeInTheDocument();
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('WOOLWORTHS')).toBeInTheDocument();

    await waitFor(() =>
      expect(tagRulesMatchPreview).toHaveBeenCalledWith({
        body: { pattern: 'WOOLWORTHS', matchType: 'contains', limit: 25 },
      })
    );

    // The rule editor authors the stored string, so it stays unparsed here.
    const chipInput = within(dialog).getByTestId('chip-input');
    expect(chipInput).toHaveValue('contains:groceries');

    await user.click(within(dialog).getByText('Save'));
    await waitFor(() =>
      expect(tagRulesUpdate).toHaveBeenCalledWith({
        path: { id: 'rule-1' },
        body: {
          entityId: 'ent-1',
          tags: ['contains:groceries'],
          confidence: 0.95,
          priority: 0,
          isActive: true,
        },
      })
    );
  });

  it('resets an entity-scoped rule back to Global via the edit dialog', async () => {
    const user = userEvent.setup();
    renderPage();
    const editButtons = await screen.findAllByRole('button', { name: /edit tag rule/i });
    await user.click(editButtons[0]!);

    const dialog = screen.getByRole('dialog');
    const entitySelect = within(dialog).getByLabelText('Entity');
    expect(entitySelect).toHaveValue('ent-1');

    await user.selectOptions(entitySelect, 'Global');
    expect(entitySelect).toHaveValue('');

    await user.click(within(dialog).getByText('Save'));
    await waitFor(() =>
      expect(tagRulesUpdate).toHaveBeenCalledWith({
        path: { id: 'rule-1' },
        body: {
          entityId: null,
          tags: ['contains:groceries'],
          confidence: 0.95,
          priority: 0,
          isActive: true,
        },
      })
    );
  });
});
