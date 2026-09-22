import { catalogueRevision } from '@/fixtures/inventory-type-catalogue';
import { Archive, ArrowRight, Copy, Database, RefreshCw, TriangleAlert } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle, Button } from '@pops/ui';

import type { TypeEditorMode } from './types';

function StaleNotice() {
  return (
    <Alert variant="destructive">
      <RefreshCw />
      <AlertTitle>This draft changed elsewhere</AlertTitle>
      <AlertDescription>
        Draft revision 13 is now based on published revision 12. Your editor opened revision{' '}
        {catalogueRevision.editorBase}. Reload the latest draft, then reapply your changes.
      </AlertDescription>
      <div className="col-start-2 mt-2">
        <Button variant="outline" size="sm">
          <RefreshCw className="h-4 w-4" />
          Reload revision 13
        </Button>
      </div>
    </Alert>
  );
}

function DestructiveNotice() {
  return (
    <Alert variant="destructive">
      <TriangleAlert />
      <AlertTitle>Cardinality cannot change in place</AlertTitle>
      <AlertDescription>
        Connectors is already published as “many” and is used by 118 items. Published kind,
        cardinality and storage are immutable.
      </AlertDescription>
      <div className="col-start-2 mt-2">
        <Button variant="outline" size="sm">
          <Copy className="h-4 w-4" />
          Create replacement field
        </Button>
      </div>
    </Alert>
  );
}

function MigrationNotice() {
  return (
    <Alert>
      <ArrowRight />
      <AlertTitle>Replacement ready; migration required</AlertTitle>
      <AlertDescription>
        Map Connectors to Connection standard with the named migration{' '}
        <span className="font-mono">electronics-connectors-v2</span>. The dry run changes 118 items
        and preserves 73 archived values.
      </AlertDescription>
      <div className="col-start-2 mt-2">
        <Button variant="outline" size="sm">
          <Database className="h-4 w-4" />
          Review migration
        </Button>
      </div>
    </Alert>
  );
}

function ArchiveNotice() {
  return (
    <Alert variant="destructive">
      <Archive />
      <AlertTitle>Archive Electronics?</AlertTitle>
      <AlertDescription>
        The type will disappear from new-item forms. Its 184 existing items remain readable and
        editable, and the type cannot be deleted or reused.
      </AlertDescription>
      <div className="col-start-2 mt-3 flex gap-2">
        <Button variant="destructive" size="sm">
          <Archive className="h-4 w-4" />
          Archive type
        </Button>
        <Button variant="outline" size="sm">
          Cancel
        </Button>
      </div>
    </Alert>
  );
}

/** Blocking or migration guidance for catalogue changes that cannot save normally. */
export function BlockingNotice({
  mode,
}: {
  mode: Extract<TypeEditorMode, 'stale' | 'destructive' | 'migration' | 'archive'>;
}) {
  if (mode === 'stale') return <StaleNotice />;
  if (mode === 'destructive') return <DestructiveNotice />;
  if (mode === 'migration') return <MigrationNotice />;
  return <ArchiveNotice />;
}
