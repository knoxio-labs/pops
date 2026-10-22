import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { DocumentsPanel } from './documents-panel';

import type { Meta, StoryObj } from '@storybook/react-vite';

import type { DetailDocument, DetailIngestion } from './detail-model';

const linked: DetailDocument[] = [
  {
    id: 8,
    title: 'Desk lamp manual',
    kind: 'Manual',
    documentType: 'manual',
    added: '15 Feb 2026',
    paperlessDocumentId: 100,
    missing: false,
  },
  {
    id: 9,
    title: 'Hardware store receipt',
    kind: 'Receipt',
    documentType: 'receipt',
    added: '2 Mar 2026',
    paperlessDocumentId: 101,
    missing: false,
  },
  {
    id: 10,
    title: 'Old warranty card',
    kind: 'Warranty',
    documentType: 'warranty',
    added: '9 Jan 2025',
    paperlessDocumentId: 55,
    missing: true,
  },
];

const pending: DetailIngestion[] = [
  { id: 30, title: 'invoice-2026-10.pdf', kind: 'Invoice', reason: null },
];

const failed: DetailIngestion[] = [
  { id: 31, title: 'scan.pdf', kind: 'Other', reason: 'Paperless could not read the PDF.' },
];

const meta = {
  title: 'Inventory/ItemDetail/DocumentsPanel',
  component: DocumentsPanel,
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <QueryClientProvider client={new QueryClient()}>
        <div className="max-w-xl">
          <Story />
        </div>
      </QueryClientProvider>
    ),
  ],
  args: {
    itemId: 'item-1',
    documents: [],
    pending: [],
    failed: [],
    paperless: 'connected',
    uploadLimits: {
      maxUploadBytes: 104857600,
      allowedMimeTypes: ['application/pdf', 'image/*', 'text/*'],
    },
    readOnly: false,
    busy: { upload: false, edit: false, unlink: false, dismiss: false },
    onUpload: () => undefined,
    onEdit: () => undefined,
    onUnlink: () => undefined,
    onDismiss: () => undefined,
    onLinked: () => undefined,
  },
} satisfies Meta<typeof DocumentsPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

/** No documents, nothing processing. */
export const Empty: Story = {};

/** Linked documents, one of them deleted in Paperless. */
export const Linked: Story = { args: { documents: linked } };

/** An upload still processing in Paperless above the linked rows. */
export const Pending: Story = { args: { documents: linked.slice(0, 1), pending } };

/** An upload Paperless refused, with its reason and dismiss. */
export const Failed: Story = { args: { documents: linked.slice(0, 1), failed } };

/** Paperless is configured but not answering: Paperless actions are disabled. */
export const PaperlessUnreachable: Story = {
  args: { documents: linked, paperless: 'unreachable' },
};

/** Paperless is not configured at all. */
export const NotConfigured: Story = {
  args: { documents: [], paperless: 'not-configured' },
};

/** A read-only item: documents open, nothing changes. */
export const ReadOnly: Story = { args: { documents: linked, failed, readOnly: true } };
