import { PageHeader } from '@pops/ui';

import { ConnectionsSection } from './connections-section';
import { DetailHeaderSection } from './detail-header-section';
import { DocumentsSection } from './documents-section';
import { HeaderActions } from './header-actions';
import { PhotoGallerySection } from './photo-gallery-section';

import type { InventoryFixtureItem } from '@/fixtures/inventory-items';

import type {
  ItemDetailConnectionsState,
  ItemDetailDocumentsState,
  ItemDetailGraphState,
  ItemDetailLinkDialogState,
  ItemDetailPhotosState,
} from './item-detail-page-types';

function ItemTitle({
  itemName,
  brand,
  model,
}: {
  itemName: string;
  brand?: string | null;
  model?: string | null;
}) {
  return (
    <div>
      <span className="text-2xl md:text-3xl font-extrabold tracking-tight">{itemName}</span>
      {(brand ?? model) && (
        <p className="text-muted-foreground font-medium uppercase text-xs tracking-widest opacity-80 mt-1">
          {[brand, model].filter(Boolean).join(' • ')}
        </p>
      )}
    </div>
  );
}

/** The page's `PageHeader` (title, breadcrumbs, delete action) and the fixed grid of item fields beneath it. */
export function ItemDetailHeader({
  item,
  connectionsCount,
  photosCount,
  locationPath,
  onNavigate,
  initialDeleteConfirmOpen,
}: {
  item: InventoryFixtureItem;
  connectionsCount: number;
  photosCount: number;
  locationPath: { id: string; name: string }[] | null;
  onNavigate: (path: string) => void;
  initialDeleteConfirmOpen: boolean;
}) {
  return (
    <>
      <PageHeader
        title={<ItemTitle itemName={item.itemName} brand={item.brand} model={item.model} />}
        backHref="/inventory"
        breadcrumbs={[{ label: 'Inventory', href: '/inventory' }, { label: item.itemName }]}
        actions={
          <HeaderActions
            id={item.id}
            itemName={item.itemName}
            connectionsCount={connectionsCount}
            photosCount={photosCount}
            onDelete={() => {}}
            onNavigate={onNavigate}
            initialDeleteConfirmOpen={initialDeleteConfirmOpen}
          />
        }
        className="mb-8"
      />
      <DetailHeaderSection item={item} locationPath={locationPath} onNavigate={onNavigate} />
    </>
  );
}

function ItemDetailConnectionsBlock({
  item,
  connections,
  graph,
  onNavigate,
}: {
  item: InventoryFixtureItem;
  connections: ItemDetailConnectionsState;
  graph: ItemDetailGraphState;
  onNavigate: (path: string) => void;
}) {
  return (
    <ConnectionsSection
      itemId={item.id}
      connections={connections.items}
      connectionsLoading={connections.loading}
      summaries={connections.summaries}
      isDisconnecting={connections.isDisconnecting}
      onDisconnect={() => {}}
      onNavigate={(id) => onNavigate(`/inventory/items/${id}`)}
      connectDialog={{
        candidateItems: connections.candidates,
        isLoading: connections.candidatesLoading,
        error: connections.candidatesError,
        onConnect: () => {},
        defaultOpen: connections.dialogOpen,
        defaultSearch: connections.dialogSearch,
      }}
      graphStatus={graph.status}
      graphData={graph.data}
      traceStatus={graph.traceStatus}
      traceTree={graph.traceTree}
      initialShowGraph={graph.initialShowGraph}
    />
  );
}

function ItemDetailDocumentsBlock({
  item,
  documents,
  linkDialog,
  linkSearch,
  setLinkSearch,
}: {
  item: InventoryFixtureItem;
  documents: ItemDetailDocumentsState;
  linkDialog: ItemDetailLinkDialogState;
  linkSearch: string;
  setLinkSearch: (value: string) => void;
}) {
  return (
    <DocumentsSection
      statusLoading={documents.statusLoading}
      configured={documents.configured}
      available={documents.available}
      paperlessBaseUrl={documents.baseUrl}
      docs={documents.items}
      docsLoading={documents.loading}
      onUnlink={() => {}}
      isUnlinking={documents.isUnlinking}
      linkDialog={{
        itemId: item.id,
        results: linkDialog.results,
        isLoading: linkDialog.loading,
        error: linkDialog.error,
        search: linkSearch,
        onSearchChange: setLinkSearch,
        onLink: () => {},
        linkingId: null,
        isLinking: false,
        defaultOpen: linkDialog.initialOpen,
      }}
    />
  );
}

/** The three sections below the header: photos, connections (with their graph/trace) and linked documents. */
export function ItemDetailSections({
  item,
  photos,
  connections,
  graph,
  documents,
  linkDialog,
  linkSearch,
  setLinkSearch,
  onNavigate,
}: {
  item: InventoryFixtureItem;
  photos: ItemDetailPhotosState;
  connections: ItemDetailConnectionsState;
  graph: ItemDetailGraphState;
  documents: ItemDetailDocumentsState;
  linkDialog: ItemDetailLinkDialogState;
  linkSearch: string;
  setLinkSearch: (value: string) => void;
  onNavigate: (path: string) => void;
}) {
  return (
    <>
      <PhotoGallerySection
        photos={photos.items}
        isLoading={photos.loading}
        isReordering={photos.isReordering}
        onReorder={() => {}}
      />
      <ItemDetailConnectionsBlock
        item={item}
        connections={connections}
        graph={graph}
        onNavigate={onNavigate}
      />
      <ItemDetailDocumentsBlock
        item={item}
        documents={documents}
        linkDialog={linkDialog}
        linkSearch={linkSearch}
        setLinkSearch={setLinkSearch}
      />
    </>
  );
}
