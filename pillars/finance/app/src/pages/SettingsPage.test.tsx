import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Institution } from './settings/types';

const institutionsListMock = vi.hoisted(() => vi.fn());
const institutionsUpdateMock = vi.hoisted(() => vi.fn());
const institutionsDeleteMock = vi.hoisted(() => vi.fn());
const institutionsUploadLogoMock = vi.hoisted(() => vi.fn());
const institutionsRemoveLogoMock = vi.hoisted(() => vi.fn());

vi.mock('../finance-api/index.js', () => ({
  institutionsList: (...args: unknown[]) => institutionsListMock(...args),
  institutionsUpdate: (...args: unknown[]) => institutionsUpdateMock(...args),
  institutionsDelete: (...args: unknown[]) => institutionsDeleteMock(...args),
  institutionsUploadLogo: (...args: unknown[]) => institutionsUploadLogoMock(...args),
  institutionsRemoveLogo: (...args: unknown[]) => institutionsRemoveLogoMock(...args),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

// The dropdown-driven Edit/Delete actions are exercised by SettingsRow's own
// tests; standing that Radix menu up in every consumer test just to reach
// `onEdit`/`onDelete` buys nothing here, so swap in a plain, always-visible
// pair of buttons that call the same callbacks.
vi.mock('./settings/SettingsRow', () => ({
  SettingsRow: ({
    title,
    onEdit,
    onDelete,
  }: {
    title: string;
    onEdit: () => void;
    onDelete: () => void;
  }) => (
    <div>
      <span>{title}</span>
      <button onClick={onEdit}>{`Edit ${title}`}</button>
      <button onClick={onDelete}>{`Delete ${title}`}</button>
    </div>
  ),
}));

import { InstitutionsSection } from './SettingsPage';

function makeInstitution(overrides: Partial<Institution> = {}): Institution {
  return {
    id: 'inst-a',
    name: 'Alpha Bank',
    colour: '#111111',
    logoAssetId: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

const instA = makeInstitution({ id: 'inst-a', name: 'Alpha Bank', colour: '#111111' });
const instB = makeInstitution({ id: 'inst-b', name: 'Beta Bank', colour: '#222222' });

function renderSection() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <InstitutionsSection />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  institutionsListMock.mockResolvedValue({ data: { data: [instA, instB] }, error: undefined });
  institutionsUpdateMock.mockImplementation(
    async ({ path, body }: { path: { id: string }; body: { name: string; colour: string } }) => ({
      data: {
        data: { ...(path.id === instA.id ? instA : instB), ...body },
        message: 'Institution updated',
      },
      error: undefined,
    })
  );
});

describe('InstitutionsSection — logo upload race (POPS-2804)', () => {
  it('blocks closing the edit dialog while a logo mutation is pending, so a slow upload for one institution cannot silently reopen the dialog on another mid-edit', async () => {
    const user = userEvent.setup();
    let resolveUpload!: (value: unknown) => void;
    institutionsUploadLogoMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveUpload = resolve;
        })
    );

    renderSection();
    await screen.findByText('Alpha Bank');

    await user.click(screen.getByRole('button', { name: 'Edit Alpha Bank' }));
    await screen.findByDisplayValue('Alpha Bank');

    const fileInput = document.querySelector<HTMLInputElement>('input[type="file"]');
    if (!fileInput) throw new Error('logo file input not found');
    const file = new File(['logo-bytes'], 'logo.png', { type: 'image/png' });
    await user.upload(fileInput, file);

    await waitFor(() => expect(institutionsUploadLogoMock).toHaveBeenCalledTimes(1));

    // The upload for Alpha Bank is still in flight. Without the fix,
    // `isSubmitting` only tracks the name/colour mutation, so Cancel is
    // enabled here and closing the dialog would let the user immediately
    // start editing Beta Bank underneath the pending upload.
    const cancelButton = screen.getByRole('button', { name: 'Cancel' });
    expect(cancelButton).toBeDisabled();
    await user.click(cancelButton);
    expect(screen.getByDisplayValue('Alpha Bank')).toBeInTheDocument();

    // Let the upload resolve — only now is it safe to close and switch.
    resolveUpload({ data: { data: instA, message: 'Logo uploaded' }, error: undefined });
    await waitFor(() => expect(cancelButton).not.toBeDisabled());

    await user.click(cancelButton);
    await waitFor(() => expect(screen.queryByDisplayValue('Alpha Bank')).not.toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Edit Beta Bank' }));
    const nameInput = await screen.findByDisplayValue('Beta Bank');
    await user.clear(nameInput);
    await user.type(nameInput, 'Beta Bank Renamed');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(institutionsUpdateMock).toHaveBeenCalledWith({
        path: { id: 'inst-b' },
        body: { name: 'Beta Bank Renamed', colour: instB.colour },
      })
    );
    // Alpha Bank was never touched by Beta Bank's edit.
    expect(institutionsUpdateMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ path: { id: 'inst-a' } })
    );
  });
});
