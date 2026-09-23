import { Check, Sparkles, TriangleAlert } from 'lucide-react';
import { useState } from 'react';

import { Alert, AlertDescription, AlertTitle, Badge, Button } from '@pops/ui';

import { InventoryApiError } from '../inventory-api-helpers';
import { isStaleDraftCode } from './catalogue-draft';
import { CompatibilityPreview } from './CompatibilityPreview';
import { PublishDialog } from './PublishDialog';

import type { CatalogueCompatibility, CatalogueDescriptor } from './types';

interface PublishPanelProps {
  readonly catalogue: CatalogueDescriptor;
  readonly compatibility: CatalogueCompatibility | null;
  readonly error: unknown;
  readonly isPending: boolean;
  readonly onAbandon: () => void;
  readonly onPublish: (input: { note: string | null; minimumProtocol?: number }) => void;
  readonly onReload: () => void;
}

const labels: Record<CatalogueCompatibility['classification'], string> = {
  compatible: 'Compatible',
  protocol_gated: 'Protocol gated',
  migration_required: 'Migration required',
  forbidden: 'Forbidden',
};

/** Summarises draft compatibility and owns the final publication review dialog. */
export function PublishPanel({
  catalogue,
  compatibility,
  error,
  isPending,
  onAbandon,
  onPublish,
  onReload,
}: PublishPanelProps) {
  const [open, setOpen] = useState(false);
  const apiError = error instanceof InventoryApiError ? error : null;
  if (catalogue.revision.status !== 'draft')
    return <PublishedPanel catalogue={catalogue} error={apiError} onReload={onReload} />;
  const blocked =
    compatibility?.classification === 'migration_required' ||
    compatibility?.classification === 'forbidden';
  return (
    <>
      <PublishError error={apiError} onReload={onReload} />
      <div className="flex flex-col gap-3 rounded-lg border border-primary/30 bg-primary/10 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-3">
          {blocked ? (
            <TriangleAlert className="mt-0.5 h-5 w-5 text-destructive" />
          ) : (
            <Check className="mt-0.5 h-5 w-5 text-primary" />
          )}
          <div>
            <p className="text-sm font-medium">Draft revision {catalogue.revision.revision}</p>
            <p className="text-xs text-muted-foreground">
              {compatibility === null
                ? 'Resume editing or review the persisted draft.'
                : `${labels[compatibility.classification]} · ${compatibility.affectedItems} affected items · ${compatibility.affectedIds.length} affected definitions`}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={onAbandon} disabled={isPending}>
            Abandon draft
          </Button>
          <Button onClick={() => setOpen(true)} disabled={isPending || blocked}>
            <Sparkles className="h-4 w-4" />
            Review and publish
          </Button>
        </div>
      </div>
      {compatibility !== null && <CompatibilityPreview compatibility={compatibility} />}
      {blocked && compatibility !== null && <BlockedNotice compatibility={compatibility} />}
      <PublishDialog
        catalogue={catalogue}
        isPending={isPending}
        open={open}
        onOpenChange={setOpen}
        onPublish={onPublish}
      />
    </>
  );
}

function PublishedPanel({
  catalogue,
  error,
  onReload,
}: {
  readonly catalogue: CatalogueDescriptor;
  readonly error: InventoryApiError | null;
  readonly onReload: () => void;
}) {
  return (
    <>
      <PublishError error={error} onReload={onReload} />
      <PublishedStatus catalogue={catalogue} />
    </>
  );
}

function PublishedStatus({ catalogue }: { readonly catalogue: CatalogueDescriptor }) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-muted/30 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-sm font-medium">Published revision {catalogue.revision.revision}</p>
        <p className="text-xs text-muted-foreground">
          Saving any change creates one resumable draft.
        </p>
      </div>
      <Badge variant="outline">No draft</Badge>
    </div>
  );
}

function BlockedNotice({ compatibility }: { readonly compatibility: CatalogueCompatibility }) {
  return (
    <Alert variant="destructive">
      <TriangleAlert />
      <AlertTitle>{labels[compatibility.classification]}</AlertTitle>
      <AlertDescription>
        This draft cannot publish without replacing the incompatible definition or supplying the
        explicit named migration through the management API.
      </AlertDescription>
    </Alert>
  );
}

function PublishError({
  error,
  onReload,
}: {
  readonly error: InventoryApiError | null;
  readonly onReload: () => void;
}) {
  if (error === null) return null;
  if (isStaleDraftCode(error.code))
    return (
      <Alert variant="destructive">
        <AlertTitle>This draft changed elsewhere</AlertTitle>
        <AlertDescription>
          Reload the latest published catalogue and draft before applying another change.
        </AlertDescription>
        <Button variant="outline" size="sm" onClick={onReload}>
          Reload
        </Button>
      </Alert>
    );
  return (
    <Alert variant="destructive">
      <AlertTitle>{error.message}</AlertTitle>
      {error.issues.length > 0 && (
        <AlertDescription>
          <ul className="list-disc space-y-1 pl-4">
            {error.issues.map((issue) => (
              <li key={`${issue.definitionId ?? 'catalogue'}-${issue.path}-${issue.code}`}>
                {issue.message}
              </li>
            ))}
          </ul>
        </AlertDescription>
      )}
    </Alert>
  );
}
