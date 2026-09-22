import { Database, RefreshCw } from 'lucide-react';

import { Badge, Button, Card, CardContent, CardHeader, PageHeader, cn } from '@pops/ui';

import { AuditDialog } from '../catalogue-editor/AuditDialog';
import { TypeList } from '../catalogue-editor/CatalogueNavigation';
import { PublishPanel } from '../catalogue-editor/PublishPanel';
import { ArchiveCatalogueDialog } from './ArchiveCatalogueDialog';
import { CatalogueEditorContent } from './CatalogueEditorContent';
import { type useTypeCataloguePage } from './useTypeCataloguePage';

import type { CatalogueOperation } from '../catalogue-editor/types';

type Page = ReturnType<typeof useTypeCataloguePage>;
type ReadyPage = Page & { readonly catalogue: NonNullable<Page['catalogue']> };

interface LayoutProps {
  readonly onAbandon: () => void;
  readonly onOperation: (operation: CatalogueOperation) => void;
  readonly onPublish: (input: { note: string | null; minimumProtocol?: number }) => void;
  readonly page: ReadyPage;
}

/** Composes the focused catalogue navigation, editor, review, and audit surfaces. */
export function TypeCatalogueLayout({ onAbandon, onOperation, onPublish, page }: LayoutProps) {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Type catalogue"
        description="Edit one persisted draft, validate compatibility, then publish an atomic revision."
        actions={
          <Button variant="outline" onClick={page.openAudit}>
            <Database className="h-4 w-4" />
            Audit history
          </Button>
        }
      />
      <RevisionNotice page={page} />
      <div className="grid gap-5 lg:grid-cols-4">
        <div className="lg:col-span-1">
          <TypeList
            types={page.types}
            selectedId={page.selectedTypeId}
            onCreate={page.createType}
            onSelect={page.selectType}
          />
        </div>
        <Card className="lg:col-span-3">
          <CardHeader className="space-y-5">
            <EditorTitle page={page} />
            <EditorSteps mode={page.mode} />
          </CardHeader>
          <CardContent className="space-y-6">
            <CatalogueEditorContent page={page} onOperation={onOperation} />
            <PublishPanel
              catalogue={page.catalogue}
              compatibility={page.compatibility}
              error={page.error}
              isPending={page.isPending}
              onReload={() => void page.reload()}
              onAbandon={onAbandon}
              onPublish={onPublish}
            />
          </CardContent>
        </Card>
      </div>
      <AuditDialog open={page.auditOpen} onOpenChange={page.setAuditOpen} />
      <ArchiveCatalogueDialog
        target={page.archiveTarget}
        onOpenChange={(open) => !open && page.setArchiveTarget(null)}
        onOperation={onOperation}
      />
    </div>
  );
}

function RevisionNotice({ page }: { readonly page: ReadyPage }) {
  return (
    <div className="rounded-lg border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
      Published revision {page.published?.revision.revision ?? page.catalogue.revision.revision}
      {page.catalogue.revision.status === 'draft' &&
        ` · editing draft ${page.catalogue.revision.revision}`}
    </div>
  );
}
function EditorTitle({ page }: { readonly page: ReadyPage }) {
  const title =
    page.mode === 'new-type' ? 'New item type' : (page.selectedType?.label ?? 'Item type');
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-xl font-semibold">{title}</h2>
          {page.catalogue.revision.status === 'draft' && (
            <Badge variant="outline">Draft revision {page.catalogue.revision.revision}</Badge>
          )}
        </div>
        {page.selectedType !== null && page.mode !== 'new-type' && (
          <p className="mt-1 text-sm text-muted-foreground">
            <span className="font-mono">{page.selectedType.key}</span> ·{' '}
            {page.selectedType.fields.length} fields
          </p>
        )}
      </div>
      {page.mode !== 'new-type' && page.selectedType !== null && (
        <Button variant="outline" onClick={() => page.setMode('type')}>
          Type details
        </Button>
      )}
    </div>
  );
}
function EditorSteps({ mode }: { readonly mode: Page['mode'] }) {
  const activeStep = mode === 'type' || mode === 'new-type' ? 0 : 1;
  return (
    <div className="grid gap-2 sm:grid-cols-3">
      {['Type details', 'Fields', 'Review & publish'].map((step, index) => (
        <div
          key={step}
          className={cn(
            'flex min-h-11 items-center gap-2 rounded-lg border px-3 text-sm',
            index === activeStep
              ? 'border-primary bg-primary/10 font-medium text-primary'
              : 'text-muted-foreground'
          )}
        >
          <span className="flex h-6 w-6 items-center justify-center rounded-full border text-xs">
            {index + 1}
          </span>
          {step}
        </div>
      ))}
    </div>
  );
}

TypeCatalogueLayout.Error = function Error({ onRetry }: { readonly onRetry: () => void }) {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Type catalogue"
        description="Define the fields and behaviour available to inventory items."
      />
      <div className="rounded-lg border p-8 text-center">
        <p className="text-destructive">Failed to load the type catalogue.</p>
        <Button variant="outline" className="mt-4" onClick={onRetry}>
          <RefreshCw className="h-4 w-4" />
          Retry
        </Button>
      </div>
    </div>
  );
};
