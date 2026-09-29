import { PackagePlus } from 'lucide-react';

import { FieldOutline } from '../catalogue-editor/CatalogueNavigation';
import { FieldForm } from '../catalogue-editor/FieldForm';
import { ExistingFieldForm } from './ExistingFieldForm';
import { type useTypeCataloguePage } from './useTypeCataloguePage';

import type { ComputedFieldEnvironment } from '../catalogue-editor/computed/computed-environment';
import type {
  CatalogueField,
  CatalogueIssueSources,
  CatalogueOperationHandler,
} from '../catalogue-editor/types';

type Page = ReturnType<typeof useTypeCataloguePage>;

function computedEnvironment(page: Page, field?: CatalogueField): ComputedFieldEnvironment {
  const draft = page.catalogue?.revision.status === 'draft' ? page.catalogue : null;
  const publishedField = page.published?.types
    .flatMap((type) => type.fields)
    .find((candidate) => candidate.id === field?.id);
  return {
    draft,
    publishedField,
    publishedRevision: page.published?.revision.revision,
    saveIssues: page.issues.saved,
    liveIssues: page.issues.live,
    compatibility: 'compatibility' in page.readiness ? page.readiness.compatibility : null,
    compatibilityOperations: 'operations' in page.readiness ? page.readiness.operations : [],
  };
}

/** Renders the selected type's field navigation and field editor. */
export function CatalogueFieldEditor({
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
    <div className="grid gap-8 lg:grid-cols-4">
      <div className="lg:col-span-1">
        <FieldOutline
          fields={page.fields}
          selectedId={page.selectedFieldId}
          onAdd={page.createField}
          onMove={page.moveField}
          onSelect={page.selectField}
          onSelectType={page.selectType}
          type={type}
          types={page.types}
        />
      </div>
      <div className="lg:col-span-3">
        <FieldFormContent issueSources={issueSources} page={page} onOperation={onOperation} />
      </div>
    </div>
  );
}

function FieldFormContent({
  issueSources,
  onOperation,
  page,
}: {
  readonly issueSources: CatalogueIssueSources;
  readonly onOperation: CatalogueOperationHandler;
  readonly page: Page;
}) {
  const { selectedField: field, selectedType: type } = page;
  if (type === null) return null;
  if (page.mode === 'new-field')
    return (
      <NewFieldForm issueSources={issueSources} onOperation={onOperation} page={page} type={type} />
    );
  if (field === undefined)
    return (
      <div className="flex flex-col items-center rounded-lg border border-dashed p-8 text-center">
        <PackagePlus className="mb-3 h-8 w-8 text-muted-foreground" />
        <p className="font-medium">Choose a field</p>
      </div>
    );
  return (
    <ExistingFieldForm
      computed={computedEnvironment(page, field)}
      editorEpoch={page.editorEpoch}
      field={field}
      isPending={page.isPending}
      issues={pageIssues(page)}
      issueSources={issueSources}
      onArchive={() =>
        page.setArchiveTarget({
          kind: 'field',
          id: field.id,
          label: field.label,
        })
      }
      onOperation={onOperation}
      onPreview={page.previewOperation}
      onRestore={() =>
        onOperation({
          kind: 'put_field',
          id: field.id,
          typeId: type.id,
          archivedAt: null,
        })
      }
      published={page.selectedFieldIsPublished}
      type={type}
      types={page.types}
    />
  );
}

function NewFieldForm({
  issueSources,
  onOperation,
  page,
  type,
}: {
  readonly issueSources: CatalogueIssueSources;
  readonly onOperation: CatalogueOperationHandler;
  readonly page: Page;
  readonly type: NonNullable<Page['selectedType']>;
}) {
  return (
    <FieldForm
      key="new-field"
      computed={computedEnvironment(page)}
      type={type}
      types={page.types}
      published={false}
      isPending={page.isPending}
      issueSources={issueSources}
      issues={pageIssues(page)}
      onOperation={onOperation}
      onPreview={page.previewOperation}
    />
  );
}

function pageIssues(page: Page) {
  return [...page.issues.saved, ...page.issues.live];
}
