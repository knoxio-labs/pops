/**
 * Keyboard-navigation and normalisation coverage for the tag and scope
 * fields on the ingest form, exercised through the real `ChipInput` (no
 * `@pops/ui` mock) so the migration off `TagPicker`/`ScopePicker` is proven
 * end to end: suggestions are wired through, arrow keys move the highlight,
 * Enter commits, Escape and click-outside dismiss, and free text still
 * commits through the shared normaliser.
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { withQueryClient } from '../test-utils';

const sdk = vi.hoisted(() => ({
  templatesList: vi.fn(),
  scopesList: vi.fn(),
  tagsList: vi.fn(),
  ingestEnrichmentStatus: vi.fn(),
  ingestRetryEnrichment: vi.fn(),
  ingestSubmit: vi.fn(),
  ingestQuickCapture: vi.fn(),
  engramsUpdate: vi.fn(),
}));

vi.mock('../cerebrum-api', () => sdk);

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { error: vi.fn() }),
}));

vi.mock('react-router', () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => {
    const React = require('react');
    return React.createElement('a', { href: to }, children);
  },
}));

import { IngestPage } from './IngestPage';

const mockScopes = [
  { scope: 'work.alpha', count: 3 },
  { scope: 'work.beta', count: 1 },
];

const mockTags = [
  { tag: 'urgent', count: 5 },
  { tag: 'reading', count: 2 },
];

function setupDefaultMocks() {
  sdk.templatesList.mockResolvedValue({ data: { templates: [] } });
  sdk.scopesList.mockResolvedValue({ data: { scopes: mockScopes } });
  sdk.tagsList.mockResolvedValue({ data: { tags: mockTags } });
  sdk.ingestEnrichmentStatus.mockReturnValue(new Promise(() => undefined));
  sdk.ingestSubmit.mockResolvedValue({ data: {} });
  sdk.ingestQuickCapture.mockResolvedValue({ data: {} });
}

function renderPage() {
  return render(withQueryClient(<IngestPage />));
}

async function openAdvanced(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByText('Advanced'));
}

beforeEach(() => {
  vi.clearAllMocks();
  setupDefaultMocks();
});

describe('IngestPage — scope ChipInput', () => {
  it('opens suggestions, arrows to the second entry, and commits it on Enter', async () => {
    const user = userEvent.setup();
    renderPage();

    const input = await screen.findByRole('combobox', { name: 'Scope input' });
    await user.click(input);
    await waitFor(() => expect(screen.getByRole('listbox')).toBeInTheDocument());

    await user.keyboard('{ArrowDown}');
    await user.keyboard('{Enter}');

    expect(await screen.findByText('work.beta')).toBeInTheDocument();
    expect(screen.queryByText('work.alpha')).not.toBeInTheDocument();
  });

  it('dismisses the dropdown on Escape', async () => {
    const user = userEvent.setup();
    renderPage();

    const input = await screen.findByRole('combobox', { name: 'Scope input' });
    await user.click(input);
    await waitFor(() => expect(screen.getByRole('listbox')).toBeInTheDocument());

    await user.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument());
  });

  it('dismisses the dropdown on click-outside', async () => {
    const user = userEvent.setup();
    renderPage();

    const input = await screen.findByRole('combobox', { name: 'Scope input' });
    await user.click(input);
    await waitFor(() => expect(screen.getByRole('listbox')).toBeInTheDocument());

    await user.click(screen.getByLabelText('Body'));

    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument());
  });

  it('normalises a free-text scope not present in suggestions on commit', async () => {
    const user = userEvent.setup();
    renderPage();

    const input = await screen.findByRole('combobox', { name: 'Scope input' });
    await user.click(input);
    await user.type(input, '  Brand New Scope{Enter}');

    expect(await screen.findByText('brand-new-scope')).toBeInTheDocument();
  });
});

describe('IngestPage — tag ChipInput', () => {
  it('opens suggestions, arrows to the second entry, and commits it on Enter', async () => {
    const user = userEvent.setup();
    renderPage();
    await openAdvanced(user);

    const input = await screen.findByRole('combobox', { name: 'Tag input' });
    await user.click(input);
    await waitFor(() => expect(screen.getByRole('listbox')).toBeInTheDocument());

    await user.keyboard('{ArrowDown}');
    await user.keyboard('{Enter}');

    expect(await screen.findByText('reading')).toBeInTheDocument();
    expect(screen.queryByText('urgent')).not.toBeInTheDocument();
  });

  it('dismisses the dropdown on Escape', async () => {
    const user = userEvent.setup();
    renderPage();
    await openAdvanced(user);

    const input = await screen.findByRole('combobox', { name: 'Tag input' });
    await user.click(input);
    await waitFor(() => expect(screen.getByRole('listbox')).toBeInTheDocument());

    await user.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument());
  });

  it('normalises a free-text tag not present in suggestions on commit ("My Tag" -> "my-tag")', async () => {
    const user = userEvent.setup();
    renderPage();
    await openAdvanced(user);

    const input = await screen.findByRole('combobox', { name: 'Tag input' });
    await user.click(input);
    await user.type(input, 'My Tag{Enter}');

    expect(await screen.findByText('my-tag')).toBeInTheDocument();
  });

  it('rejects a tag already selected without adding a duplicate chip', async () => {
    const user = userEvent.setup();
    renderPage();
    await openAdvanced(user);

    const input = await screen.findByRole('combobox', { name: 'Tag input' });
    await user.click(input);
    await user.type(input, 'urgent{Enter}');
    expect(await screen.findByText('urgent')).toBeInTheDocument();

    await user.type(input, 'urgent{Enter}');
    expect(screen.getAllByText('urgent')).toHaveLength(1);
  });
});
