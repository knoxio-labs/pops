import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { buildWorld } from '../../foundation/model/placement-model';
import { DocumentsSection, documentsSummary } from './documents-section';

import type { ReactElement } from 'react';

import type { ItemRowModel } from '../../foundation/model/model';
import type { DetailDocument, DetailIngestion, ItemDetailModel } from './detail-model';

const mocks = vi.hoisted(() => ({
  documentsUnlink: vi.fn(),
  documentsUpdate: vi.fn(),
  documentsDismissIngestion: vi.fn(),
  uploadItemDocument: vi.fn(),
}));

vi.mock('../../components/LinkDocumentDialog', () => ({
  LinkDocumentDialog: ({ trigger }: { trigger?: ReactElement }) => trigger ?? null,
}));
vi.mock('../../inventory-api/index.js', () => ({
  documentsUnlink: mocks.documentsUnlink,
  documentsUpdate: mocks.documentsUpdate,
  documentsDismissIngestion: mocks.documentsDismissIngestion,
}));
vi.mock('./document-upload-api', () => ({ uploadItemDocument: mocks.uploadItemDocument }));

const item: ItemRowModel = {
  id: 'item-1',
  name: 'Desk lamp',
  typeId: 'type-1',
  typeName: 'Lighting',
  code: 'LAMP-1',
  quantity: 1,
  container: null,
  lifecycle: 'active',
  placement: { kind: 'location', locationId: 'study' },
  previous: null,
  sync: 'synced',
  photoUrl: null,
  note: null,
  updatedAt: '2026-09-01T00:00:00Z',
};

const world = buildWorld([item], [{ id: 'study', name: 'Study', parentId: null, kind: 'room' }]);

const baseModel: ItemDetailModel = {
  item,
  world,
  relatedWorld: world,
  aggregate: null,
  documents: [],
  pendingDocuments: [],
  failedDocuments: [],
  paperless: 'connected',
  uploadLimits: { maxUploadBytes: 10, allowedMimeTypes: ['application/pdf', 'image/*'] },
  connections: [],
  events: [],
  eventCount: 0,
};

const manual: DetailDocument = {
  id: 8,
  title: 'Desk lamp manual',
  kind: 'Manual',
  documentType: 'manual',
  added: '15 Feb 2026',
  paperlessDocumentId: 100,
  missing: false,
};

const failedUpload: DetailIngestion = {
  id: 31,
  title: 'scan.pdf',
  kind: 'Receipt',
  reason: 'Paperless could not read the PDF',
};

const ok = { data: { message: 'ok' }, error: undefined };

function renderSection(model: ItemDetailModel, readOnly = false) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onLinksChanged = vi.fn();
  render(
    <QueryClientProvider client={queryClient}>
      <DocumentsSection
        itemId="item-1"
        model={model}
        readOnly={readOnly}
        onLinksChanged={onLinksChanged}
      />
    </QueryClientProvider>
  );
  return { onLinksChanged };
}

function fileInput(): HTMLInputElement {
  const input = within(screen.getByRole('dialog'))
    .getByRole('button', {
      name: /drag/i,
    })
    .querySelector('input[type="file"]');
  if (!(input instanceof HTMLInputElement)) throw new Error('no file input');
  return input;
}

function pdf(bytes: number, name = 'manual.pdf', type = 'application/pdf'): File {
  return new File(['x'.repeat(bytes)], name, { type });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.documentsUnlink.mockResolvedValue(ok);
  mocks.documentsUpdate.mockResolvedValue({
    data: { data: manual, message: 'ok' },
    error: undefined,
  });
  mocks.documentsDismissIngestion.mockResolvedValue(ok);
  mocks.uploadItemDocument.mockResolvedValue({ id: 1 });
});

describe('documentsSummary', () => {
  it('returns the integration state, empty state, and missing count', () => {
    expect(documentsSummary([], 'unreachable')).toBe('Paperless is unreachable');
    expect(documentsSummary([], 'not-configured')).toBe('Paperless is not connected');
    expect(documentsSummary([], 'connected')).toBe('No documents linked');
    expect(
      documentsSummary(
        [
          { ...manual, kind: 'Warranty', missing: true },
          { ...manual, id: 9, kind: 'Manual' },
          { ...manual, id: 10, kind: 'Warranty', missing: true },
        ],
        'connected'
      )
    ).toBe('Warranty, Manual. 2 deleted in Paperless');
  });
});

describe('DocumentsSection rows', () => {
  it('opens a linked document through the inventory file proxy in a new tab', () => {
    renderSection({ ...baseModel, documents: [manual] });

    const open = screen.getByRole('link', { name: 'Open Desk lamp manual' });
    expect(open).toHaveAttribute('href', '/api/inventory/documents/8/file');
    expect(open).toHaveAttribute('target', '_blank');
  });

  it('renders a missing document without open or edit and keeps unlink enabled during an outage', () => {
    renderSection({
      ...baseModel,
      documents: [{ ...manual, missing: true }],
      paperless: 'unreachable',
    });

    expect(screen.getByText('Desk lamp manual')).toHaveClass('line-through');
    expect(screen.getByText('Deleted in Paperless. Unlink it to tidy up.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Open Desk lamp manual')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Edit Desk lamp manual')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Unlink Desk lamp manual' })).not.toHaveAttribute(
      'aria-disabled'
    );
  });

  it('disables Paperless actions with the outage reason when Paperless is unreachable', () => {
    renderSection({ ...baseModel, documents: [manual], paperless: 'unreachable' });

    expect(screen.getByRole('button', { name: 'Add file' })).toHaveAttribute(
      'aria-disabled',
      'true'
    );
    expect(screen.getByRole('button', { name: 'Link existing' })).toHaveAttribute(
      'aria-disabled',
      'true'
    );
    expect(screen.getByRole('button', { name: 'Edit Desk lamp manual' })).toHaveAttribute(
      'aria-disabled',
      'true'
    );
    expect(screen.getByRole('button', { name: 'Open Desk lamp manual' })).toBeDisabled();
  });

  it('disables every write on a read-only item but keeps open', () => {
    renderSection({ ...baseModel, documents: [manual], failedDocuments: [failedUpload] }, true);

    for (const name of [
      'Add file',
      'Edit Desk lamp manual',
      'Unlink Desk lamp manual',
      'Dismiss scan.pdf',
    ]) {
      expect(screen.getByRole('button', { name })).toHaveAttribute('aria-disabled', 'true');
    }
    expect(screen.getByRole('link', { name: 'Open Desk lamp manual' })).toBeInTheDocument();
  });

  it('shows pending uploads as processing in Paperless', () => {
    renderSection({
      ...baseModel,
      pendingDocuments: [{ id: 30, title: 'receipt.pdf', kind: 'Receipt', reason: null }],
    });

    expect(screen.getByText('receipt.pdf')).toBeInTheDocument();
    expect(screen.getByText('Receipt · Processing in Paperless')).toBeInTheDocument();
    expect(screen.queryByText('No documents linked.')).not.toBeInTheDocument();
  });
});

describe('DocumentsSection upload', () => {
  it('refuses a file over the cap before sending anything', async () => {
    const user = userEvent.setup();
    renderSection(baseModel);

    await user.click(screen.getByRole('button', { name: 'Add file' }));
    await user.upload(fileInput(), pdf(11));

    expect(screen.getByRole('alert')).toHaveTextContent('Paperless takes files up to 10 B.');
    const send = screen.getByRole('button', { name: 'Upload' });
    expect(send).toBeDisabled();
    await user.click(send);
    expect(mocks.uploadItemDocument).not.toHaveBeenCalled();
  });

  it('accepts a file exactly at the cap', async () => {
    const user = userEvent.setup();
    const { onLinksChanged } = renderSection(baseModel);

    await user.click(screen.getByRole('button', { name: 'Add file' }));
    const file = pdf(10);
    await user.upload(fileInput(), file);
    await user.selectOptions(screen.getByLabelText('Kind'), 'warranty');
    await user.type(screen.getByLabelText('Title (optional)'), 'Lamp warranty');
    await user.click(screen.getByRole('button', { name: 'Upload' }));

    await waitFor(() =>
      expect(mocks.uploadItemDocument).toHaveBeenCalledWith({
        itemId: 'item-1',
        file,
        documentType: 'warranty',
        title: 'Lamp warranty',
      })
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(onLinksChanged).toHaveBeenCalled();
  });

  it('refuses a type outside the allowlist before sending anything', async () => {
    const user = userEvent.setup({ applyAccept: false });
    renderSection(baseModel);

    await user.click(screen.getByRole('button', { name: 'Add file' }));
    await user.upload(fileInput(), pdf(3, 'notes.zip', 'application/zip'));

    expect(screen.getByRole('alert')).toHaveTextContent(
      'notes.zip is application/zip. Paperless takes application/pdf, image/*.'
    );
    expect(screen.getByRole('button', { name: 'Upload' })).toBeDisabled();
    expect(mocks.uploadItemDocument).not.toHaveBeenCalled();
  });

  it('defaults the kind to other and leaves the server to check when limits are unknown', async () => {
    const user = userEvent.setup({ applyAccept: false });
    renderSection({ ...baseModel, uploadLimits: null });

    await user.click(screen.getByRole('button', { name: 'Add file' }));
    const file = pdf(5000, 'big.zip', 'application/zip');
    await user.upload(fileInput(), file);
    await user.click(screen.getByRole('button', { name: 'Upload' }));

    await waitFor(() =>
      expect(mocks.uploadItemDocument).toHaveBeenCalledWith({
        itemId: 'item-1',
        file,
        documentType: 'other',
        title: '',
      })
    );
  });
});

describe('DocumentsSection edits', () => {
  it('sends only the title when only the title changed', async () => {
    const user = userEvent.setup();
    renderSection({ ...baseModel, documents: [manual] });

    await user.click(screen.getByRole('button', { name: 'Edit Desk lamp manual' }));
    const title = screen.getByLabelText('Title');
    await user.clear(title);
    await user.type(title, '  Lamp manual v2 ');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(mocks.documentsUpdate).toHaveBeenCalledWith({
        path: { id: 8 },
        body: { title: 'Lamp manual v2' },
      })
    );
  });

  it('sends only the kind when only the kind changed', async () => {
    const user = userEvent.setup();
    renderSection({ ...baseModel, documents: [manual] });

    await user.click(screen.getByRole('button', { name: 'Edit Desk lamp manual' }));
    await user.selectOptions(screen.getByLabelText('Kind'), 'invoice');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(mocks.documentsUpdate).toHaveBeenCalledWith({
        path: { id: 8 },
        body: { documentType: 'invoice' },
      })
    );
  });

  it('keeps Save disabled until something changed, and refuses a blank title', async () => {
    const user = userEvent.setup();
    renderSection({ ...baseModel, documents: [manual] });

    await user.click(screen.getByRole('button', { name: 'Edit Desk lamp manual' }));
    const save = screen.getByRole('button', { name: 'Save' });
    expect(save).toBeDisabled();
    await user.clear(screen.getByLabelText('Title'));
    expect(screen.getByText('A document needs a title.')).toBeInTheDocument();
    expect(save).toBeDisabled();
    expect(mocks.documentsUpdate).not.toHaveBeenCalled();
  });

  it('sends nothing when the unlink confirmation is cancelled', async () => {
    const user = userEvent.setup();
    renderSection({ ...baseModel, documents: [manual] });

    await user.click(screen.getByRole('button', { name: 'Unlink Desk lamp manual' }));
    expect(
      screen.getByText('It stops showing on this item. The document stays in Paperless.')
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(mocks.documentsUnlink).not.toHaveBeenCalled();
  });

  it('unlinks the link id once confirmed', async () => {
    const user = userEvent.setup();
    const { onLinksChanged } = renderSection({ ...baseModel, documents: [manual] });

    await user.click(screen.getByRole('button', { name: 'Unlink Desk lamp manual' }));
    await user.click(screen.getByRole('button', { name: 'Unlink' }));

    await waitFor(() => expect(mocks.documentsUnlink).toHaveBeenCalledWith({ path: { id: 8 } }));
    await waitFor(() => expect(onLinksChanged).toHaveBeenCalled());
  });

  it('shows a failed upload with its reason and dismisses it', async () => {
    const user = userEvent.setup();
    const { onLinksChanged } = renderSection({
      ...baseModel,
      paperless: 'unreachable',
      failedDocuments: [failedUpload],
    });

    expect(screen.getByText('Paperless could not read the PDF')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Dismiss scan.pdf' }));

    await waitFor(() =>
      expect(mocks.documentsDismissIngestion).toHaveBeenCalledWith({ path: { id: 31 } })
    );
    await waitFor(() => expect(onLinksChanged).toHaveBeenCalled());
  });
});
