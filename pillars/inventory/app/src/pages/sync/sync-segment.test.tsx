import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ShortcutProvider } from '../../foundation/shortcuts/shortcut-provider.js';
import {
  DESIGN_NOW,
  busyLedger,
  codeCase,
  deletedCase,
} from '../../foundation/test-fixtures/sync.js';
import { SyncSegment } from './sync-segment.js';

import type { ReactElement } from 'react';

import type { SyncLedger } from './sync-model.js';

const mocks = vi.hoisted(() => ({
  add: vi.fn(),
  revert: vi.fn(),
  sendInventoryMutation: vi.fn(),
  setCode: vi.fn(),
  showUndoToast: vi.fn(),
  useItemVerbs: vi.fn(),
  useRepairPhotoUploads: vi.fn(),
  useRevertEvent: vi.fn(),
  useWebItemDetail: vi.fn(),
}));

vi.mock('../../foundation/feedback/undo-toast.js', () => ({
  showUndoToast: mocks.showUndoToast,
}));
vi.mock('../../foundation/photos/use-repair-photo-uploads.js', () => ({
  useRepairPhotoUploads: mocks.useRepairPhotoUploads,
}));
vi.mock('../../inventory-web/item-verbs.js', () => ({ useItemVerbs: mocks.useItemVerbs }));
vi.mock('../../inventory-web/mutation-client.js', () => ({
  sendInventoryMutation: mocks.sendInventoryMutation,
}));
vi.mock('../../inventory-web/useRevertEvent.js', () => ({
  useRevertEvent: mocks.useRevertEvent,
}));
vi.mock('../../inventory-web/useWebItemDetail.js', () => ({
  useWebItemDetail: mocks.useWebItemDetail,
}));

function RepairSegment(): ReactElement {
  const [openId, setOpenId] = useState<string | null>(codeCase.id);
  const ledger: SyncLedger = { ...busyLedger, attention: [codeCase, deletedCase] };
  return (
    <SyncSegment
      ledger={ledger}
      segment="attention"
      now={DESIGN_NOW}
      openId={openId}
      onSegment={vi.fn()}
      onOpenCase={setOpenId}
      onOpenResolved={setOpenId}
      onCloseCase={() => setOpenId(null)}
      onStepCase={setOpenId}
    />
  );
}

function renderSegment(): void {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <MemoryRouter initialEntries={['/inventory/sync']}>
      <QueryClientProvider client={queryClient}>
        <ShortcutProvider globalHandlers={{}}>
          <RepairSegment />
        </ShortcutProvider>
      </QueryClientProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  mocks.add.mockResolvedValue(undefined);
  mocks.revert.mockResolvedValue(undefined);
  mocks.sendInventoryMutation.mockResolvedValue({ status: 'applied', seq: 42 });
  mocks.setCode.mockResolvedValue({ status: 'applied', seq: 41, undo: null });
  mocks.showUndoToast.mockReturnValue('toast');
  mocks.useItemVerbs.mockReturnValue({ setCode: mocks.setCode });
  mocks.useRepairPhotoUploads.mockReturnValue({ add: mocks.add, queue: [], refused: [] });
  mocks.useRevertEvent.mockReturnValue(mocks.revert);
  mocks.useWebItemDetail.mockReturnValue({ data: undefined, isError: false, isPending: false });
});

describe('SyncSegment', () => {
  it('clears an applied outcome when Next case opens another repair', async () => {
    renderSegment();

    fireEvent.click(screen.getByRole('button', { name: 'Use code T03' }));
    await waitFor(() => expect(screen.getByText('Code set to T03.')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Next case, 1 left' }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Restore Step ladder' })).toBeInTheDocument()
    );
    expect(screen.queryByText('Code set to T03.')).not.toBeInTheDocument();
  });
});
