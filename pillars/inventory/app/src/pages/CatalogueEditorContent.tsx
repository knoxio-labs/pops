import { Button } from '@pops/ui';

import { TypeForm } from '../catalogue-editor/TypeForm';
import { CatalogueFieldEditor } from './CatalogueFieldEditor';
import { type useTypeCataloguePage } from './useTypeCataloguePage';

import type { CatalogueIssueSources, CatalogueOperationHandler } from '../catalogue-editor/types';

type Page = ReturnType<typeof useTypeCataloguePage>;

/** Renders the active type or field editor selected by the page model. */
export function CatalogueEditorContent({
  onOperation,
  page,
}: {
  readonly onOperation: CatalogueOperationHandler;
  readonly page: Page;
}) {
  const issueSources = pageIssueSources(page);
  if (page.mode === 'new-type')
    return (
      <TypeForm
        isPending={page.isPending}
        issueSources={issueSources}
        issues={[...page.issues.saved, ...page.issues.live]}
        onPreview={page.previewOperation}
        onSave={onOperation}
        types={page.types}
      />
    );
  if (page.mode === 'type')
    return <TypeEditor issueSources={issueSources} page={page} onOperation={onOperation} />;
  return <CatalogueFieldEditor issueSources={issueSources} page={page} onOperation={onOperation} />;
}

function TypeEditor({
  issueSources,
  onOperation,
  page,
}: {
  readonly issueSources: CatalogueIssueSources;
  readonly onOperation: CatalogueOperationHandler;
  readonly page: Page;
}) {
  const type = page.selectedType;
  if (type === null) return null;
  return (
    <>
      <TypeForm
        key={`${type.id}-${page.editorEpoch}`}
        type={type}
        isPending={page.isPending}
        issueSources={issueSources}
        issues={[...page.issues.saved, ...page.issues.live]}
        onPreview={page.previewOperation}
        onSave={onOperation}
        published={page.published?.types.some((candidate) => candidate.id === type.id) ?? false}
        types={page.types}
        onArchive={() =>
          page.setArchiveTarget({
            kind: 'type',
            id: type.id,
            label: type.label,
          })
        }
        onRestore={() => onOperation({ kind: 'put_type', id: type.id, archivedAt: null })}
      />
      <div className="flex justify-end">
        <Button onClick={page.continueToFields}>Continue to fields</Button>
      </div>
    </>
  );
}
function pageIssueSources(page: Page): CatalogueIssueSources {
  return page.issues.sources;
}
