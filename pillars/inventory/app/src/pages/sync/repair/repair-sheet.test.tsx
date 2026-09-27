import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ShortcutProvider } from '../../../foundation/shortcuts/shortcut-provider.js';
import {
  DESIGN_NOW,
  archivedCase,
  codeCase,
  deletedCase,
  photoCase,
  placementCase,
} from '../../../foundation/test-fixtures/sync.js';
import { RepairSheet } from './repair-sheet.js';

import type { ReactElement } from 'react';

import type { CasePosition, RepairCase } from '../sync-model.js';

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

vi.mock('../../../foundation/feedback/undo-toast.js', () => ({
  showUndoToast: mocks.showUndoToast,
}));
vi.mock('../../../foundation/photos/use-repair-photo-uploads.js', () => ({
  useRepairPhotoUploads: mocks.useRepairPhotoUploads,
}));
vi.mock('../../../inventory-web/item-verbs.js', () => ({ useItemVerbs: mocks.useItemVerbs }));
vi.mock('../../../inventory-web/mutation-client.js', () => ({
  sendInventoryMutation: mocks.sendInventoryMutation,
}));
vi.mock('../../../inventory-web/useRevertEvent.js', () => ({
  useRevertEvent: mocks.useRevertEvent,
}));
vi.mock('../../../inventory-web/useWebItemDetail.js', () => ({
  useWebItemDetail: mocks.useWebItemDetail,
}));

function LocationText(): ReactElement {
  const location = useLocation();
  return <output data-testid="location">{location.pathname + location.search}</output>;
}

function renderSheet(
  repair: RepairCase,
  options: { position?: CasePosition | null; disabledReason?: string } = {}
): void {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <MemoryRouter initialEntries={['/inventory/sync']}>
      <QueryClientProvider client={queryClient}>
        <ShortcutProvider globalHandlers={{}}>
          <RepairSheet
            repair={repair}
            device="Joao's iPhone"
            now={DESIGN_NOW}
            position={options.position ?? null}
            disabledReason={options.disabledReason}
            onStep={vi.fn()}
            onClose={vi.fn()}
          />
          <LocationText />
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
  mocks.setCode.mockResolvedValue({
    status: 'applied',
    seq: 41,
    undo: mocks.revert,
  });
  mocks.showUndoToast.mockReturnValue('toast');
  mocks.useItemVerbs.mockReturnValue({ setCode: mocks.setCode });
  mocks.useRepairPhotoUploads.mockReturnValue({ add: mocks.add, queue: [], refused: [] });
  mocks.useRevertEvent.mockReturnValue(mocks.revert);
  mocks.useWebItemDetail.mockReturnValue({ data: undefined, isError: false, isPending: false });
});

describe('RepairSheet', () => {
  it('shows evidence and uses the suggested code with an undo offer', async () => {
    renderSheet(codeCase);

    expect(
      screen.getByText(
        (_, element) =>
          element?.tagName === 'P' &&
          element.textContent?.includes('T02 is printed on Cable tub') === true
      )
    ).toBeInTheDocument();
    expect(
      screen.getByText((_, element) => element?.tagName === 'SPAN' && element.textContent === 'T03')
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Use code T03' }));

    await waitFor(() => expect(mocks.setCode).toHaveBeenCalledWith('item-case-parts-code', 'T03'));
    expect(mocks.showUndoToast).toHaveBeenCalledWith(
      expect.objectContaining({ concept: 'code', message: 'Code set to T03' })
    );
    expect(screen.getByText('Code set to T03.')).toBeInTheDocument();
    expect(
      screen.getByText(
        'The change is saved in the web app. The device will finish this case on its next sync.'
      )
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Both copies then match, so either choice on the device closes the case. Print the new label afterwards.'
      )
    ).toBeInTheDocument();
    expect(screen.queryByText(/Nothing left to do/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Done' })).toBeInTheDocument();

    const toast = mocks.showUndoToast.mock.calls[0]?.[0];
    if (toast === undefined) throw new Error('code change did not offer undo');
    await toast.onUndo();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Use code T03' })).toBeInTheDocument()
    );
  });

  it('opens the holder search without making a write', async () => {
    renderSheet(codeCase);

    fireEvent.click(screen.getByRole('button', { name: 'Open Cable tub' }));

    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent('/inventory/search?code=T02')
    );
    expect(mocks.setCode).not.toHaveBeenCalled();
  });

  it('restores a deleted item and wires the resulting undo to the event revert', async () => {
    renderSheet(deletedCase);

    fireEvent.click(screen.getByRole('button', { name: 'Restore Step ladder' }));

    await waitFor(() =>
      expect(mocks.sendInventoryMutation).toHaveBeenCalledWith({
        command: { op: 'item.restoreDeleted', args: {} },
        entityId: 'item-case-ladder-deleted',
      })
    );
    await waitFor(() => expect(screen.getByText('Restored Step ladder.')).toBeInTheDocument());
    expect(
      screen.getByText(
        "It returns with its history. Choose Restore on Joao's iPhone to send the held change."
      )
    ).toBeInTheDocument();
    expect(screen.queryByText(/Nothing left to do/)).not.toBeInTheDocument();
    const toast = mocks.showUndoToast.mock.calls[0]?.[0];
    if (toast === undefined) throw new Error('restore did not offer undo');
    await toast.onUndo();
    expect(mocks.revert).toHaveBeenCalledWith({
      seq: 42,
      entityId: 'item-case-ladder-deleted',
    });
  });

  it('keeps a photo repair open after the upload and shows the device follow-up', async () => {
    mocks.add.mockResolvedValue([{ fileName: 'drill.jpg', status: 'attached' }]);
    renderSheet(photoCase);

    fireEvent.change(screen.getByLabelText('Choose a photo'), {
      target: { files: [new File(['photo'], 'drill.jpg', { type: 'image/jpeg' })] },
    });

    await waitFor(() => expect(screen.getByText('Photo sent.')).toBeInTheDocument());
    expect(screen.getByText("Or choose Retry or Remove on Joao's iPhone.")).toBeInTheDocument();
    expect(screen.queryByText(/both copies match/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Nothing left to do/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Done' })).not.toBeInTheDocument();
  });

  it('keeps writes disabled when the device report does not identify the item', () => {
    const repair: RepairCase = {
      ...placementCase,
      mine: { value: 'Office 04', source: 'iPhone', at: DESIGN_NOW },
      theirs: { value: 'Desk', source: 'web', at: DESIGN_NOW },
    };
    renderSheet(repair);

    const action = screen.getByRole('button', { name: 'Move to Office 04' });
    expect(action).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(action);
    expect(mocks.sendInventoryMutation).not.toHaveBeenCalled();
  });

  it('blocks item-dependent actions while the item is loading', () => {
    mocks.useWebItemDetail.mockReturnValue({ data: undefined, isError: false, isPending: true });
    renderSheet(codeCase);

    const action = screen.getByRole('button', { name: 'Use code T03' });
    expect(action).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(action);
    expect(mocks.setCode).not.toHaveBeenCalled();
  });

  it('keeps the previous and next cases available in the sheet footer', () => {
    const onStep = vi.fn();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <MemoryRouter initialEntries={['/inventory/sync']}>
        <QueryClientProvider client={queryClient}>
          <ShortcutProvider globalHandlers={{}}>
            <RepairSheet
              repair={archivedCase}
              device="Joao's iPhone"
              now={DESIGN_NOW}
              position={{ index: 1, total: 3, previousId: 'case-before', nextId: 'case-after' }}
              onStep={onStep}
              onClose={vi.fn()}
            />
          </ShortcutProvider>
        </QueryClientProvider>
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(onStep).toHaveBeenNthCalledWith(1, 'case-before');
    expect(onStep).toHaveBeenNthCalledWith(2, 'case-after');
  });
});
