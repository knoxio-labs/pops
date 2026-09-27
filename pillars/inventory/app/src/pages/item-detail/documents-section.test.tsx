import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { buildWorld } from '../../foundation/model/placement-model';
import { DocumentsSection, documentsSummary } from './documents-section';

import type { ReactElement } from 'react';

import type { ItemRowModel } from '../../foundation/model/model';
import type { DetailDocument, ItemDetailModel } from './detail-model';

const mocks = vi.hoisted(() => ({ documentsUnlink: vi.fn() }));

vi.mock('../../components/LinkDocumentDialog', () => ({
  LinkDocumentDialog: ({ trigger }: { trigger?: ReactElement }) => trigger ?? null,
}));
vi.mock('../../inventory-api/index.js', () => ({ documentsUnlink: mocks.documentsUnlink }));

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

const baseModel: ItemDetailModel = {
  item,
  world: buildWorld([item], [{ id: 'study', name: 'Study', parentId: null, kind: 'room' }]),
  relatedWorld: buildWorld([item], [{ id: 'study', name: 'Study', parentId: null, kind: 'room' }]),
  aggregate: {
    facts: [],
    type: null,
    fieldValues: [],
    provenance: {
      purchasedOn: null,
      pricePaid: null,
      merchant: null,
      warrantyUntil: null,
      purchase: null,
    },
    photos: [],
  },
  documents: [],
  paperless: 'connected',
  paperlessBaseUrl: 'https://paperless.example.test',
  connections: [],
  events: [],
  eventCount: 0,
};

const missingDocument: DetailDocument = {
  id: 8,
  title: 'Desk lamp manual',
  kind: 'Manual',
  added: '15 Feb 2026',
  paperlessDocumentId: 100,
  missing: true,
};

function renderSection(model: ItemDetailModel, readOnly = false): void {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <DocumentsSection
        itemId="item-1"
        model={model}
        readOnly={readOnly}
        onLinksChanged={vi.fn()}
      />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('documentsSummary', () => {
  it('returns the integration state, empty state, and missing count', () => {
    expect(documentsSummary([], 'unreachable')).toBe('Paperless is unreachable');
    expect(documentsSummary([], 'not-configured')).toBe('Paperless is not connected');
    expect(documentsSummary([], 'connected')).toBe('No documents linked');
    expect(
      documentsSummary(
        [
          { ...missingDocument, kind: 'Warranty' },
          { ...missingDocument, id: 9, kind: 'Manual', missing: false },
          { ...missingDocument, id: 10, kind: 'Warranty' },
        ],
        'connected'
      )
    ).toBe('Warranty, Manual. 2 deleted in Paperless');
  });
});

describe('DocumentsSection', () => {
  it('renders a missing document without Paperless open and keeps unlink enabled during an outage', () => {
    renderSection({ ...baseModel, documents: [missingDocument], paperless: 'unreachable' });

    expect(screen.getByText('Desk lamp manual')).toHaveClass(
      'text-muted-foreground',
      'line-through'
    );
    expect(screen.getByText('Deleted in Paperless. Unlink it to tidy up.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Open in Paperless')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Unlink document' })).not.toHaveAttribute(
      'aria-disabled'
    );
  });

  it('keeps unlink disabled for missing documents in read-only mode', () => {
    renderSection({ ...baseModel, documents: [missingDocument], paperless: 'unreachable' }, true);

    expect(screen.getByRole('button', { name: 'Unlink document' })).toHaveAttribute(
      'aria-disabled',
      'true'
    );
  });
});
