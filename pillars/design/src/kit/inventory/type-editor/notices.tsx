import { catalogueRevision } from '@/fixtures/inventory-type-catalogue';
import { Archive, RefreshCw, TriangleAlert } from 'lucide-react';

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
        cardinality and storage are immutable. Create a replacement field instead.
      </AlertDescription>
    </Alert>
  );
}

/**
 * Guidance for the destructive-change dead end: this editor authors the
 * replacement field but never the archive-and-migrate that retires the old
 * one, so the reader needs the exact route (Inventory ADR-002 D5, POPS-4363
 * MCP-only migrations; #5101 `replacedBy` lineage; POPS-4555 tracks a future
 * web archive-with-replacement control).
 */
function ReplacementNotice() {
  return (
    <Alert variant="destructive">
      <TriangleAlert />
      <AlertTitle>Create a replacement, then migrate through MCP</AlertTitle>
      <AlertDescription>
        <p>
          Connectors is published as “many” and used by 118 items; published kind, cardinality and
          storage are immutable. Use <span className="font-medium">+ Field</span> above to create
          the replacement in this editor, exactly like every other new field.
        </p>
        <p className="mt-2">
          This editor does not publish migrations. Once the replacement validates, record it and
          move the values through MCP:
        </p>
        <ol className="my-1 list-decimal space-y-0.5 pl-5">
          <li>
            <code className="font-mono">inventory.catalogue.patchDraft</code> with an{' '}
            <code className="font-mono">archive_field</code> operation naming Connectors’{' '}
            <code className="font-mono">replacedBy</code> as the new field.
          </li>
          <li>
            <code className="font-mono">inventory.catalogue.publishDraft</code> with a declared
            migration for the 118 affected items.
          </li>
        </ol>
        <p className="mt-2">
          Queued phone edits to Connectors move onto the replacement automatically once it
          publishes, when its shape matches; otherwise they are held for repair.
        </p>
      </AlertDescription>
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

/**
 * Blocking guidance for catalogue changes that cannot save normally. There is
 * no migration-publish notice: the web editor never publishes migrations;
 * `replacement` names the MCP route instead of leaving a dead end.
 */
export function BlockingNotice({
  mode,
}: {
  mode: Extract<TypeEditorMode, 'stale' | 'destructive' | 'replacement' | 'archive'>;
}) {
  if (mode === 'stale') return <StaleNotice />;
  if (mode === 'destructive') return <DestructiveNotice />;
  if (mode === 'replacement') return <ReplacementNotice />;
  return <ArchiveNotice />;
}
