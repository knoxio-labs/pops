import { PackagePlus } from 'lucide-react';

import { Button } from '@pops/ui';

import { FieldOutline } from '../catalogue-editor/CatalogueNavigation';
import { FieldForm } from '../catalogue-editor/FieldForm';
import { TypeForm } from '../catalogue-editor/TypeForm';
import { type useTypeCataloguePage } from './useTypeCataloguePage';

import type { CatalogueOperation } from '../catalogue-editor/types';

type Page = ReturnType<typeof useTypeCataloguePage>;

/** Renders the active type or field editor selected by the page model. */
export function CatalogueEditorContent({
  onOperation,
  page,
}: {
  readonly onOperation: (operation: CatalogueOperation) => void;
  readonly page: Page;
}) {
  if (page.mode === 'new-type')
    return (
      <TypeForm isPending={page.isPending} onPreview={page.previewOperation} onSave={onOperation} />
    );
  if (page.mode === 'type') return <TypeEditor page={page} onOperation={onOperation} />;
  return <FieldEditor page={page} onOperation={onOperation} />;
}

function TypeEditor({
  onOperation,
  page,
}: {
  readonly onOperation: (operation: CatalogueOperation) => void;
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
        onPreview={page.previewOperation}
        onSave={onOperation}
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
function FieldEditor({
  onOperation,
  page,
}: {
  readonly onOperation: (operation: CatalogueOperation) => void;
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
        />
      </div>
      <div className="lg:col-span-3">
        <FieldFormContent page={page} onOperation={onOperation} />
      </div>
    </div>
  );
}
function FieldFormContent({
  onOperation,
  page,
}: {
  readonly onOperation: (operation: CatalogueOperation) => void;
  readonly page: Page;
}) {
  const type = page.selectedType;
  const field = page.selectedField;
  if (type === null) return null;
  if (page.mode === 'new-field')
    return (
      <FieldForm
        key="new-field"
        type={type}
        types={page.types}
        published={false}
        isPending={page.isPending}
        onOperation={onOperation}
        onPreview={page.previewOperation}
      />
    );
  if (field === undefined)
    return (
      <div className="flex flex-col items-center rounded-lg border border-dashed p-8 text-center">
        <PackagePlus className="mb-3 h-8 w-8 text-muted-foreground" />
        <p className="font-medium">Choose a field</p>
      </div>
    );
  return (
    <FieldForm
      key={`${field.id}-${page.editorEpoch}`}
      field={field}
      type={type}
      types={page.types}
      published={page.selectedFieldIsPublished}
      isPending={page.isPending}
      onOperation={onOperation}
      onPreview={page.previewOperation}
      onArchive={() =>
        page.setArchiveTarget({
          kind: 'field',
          id: field.id,
          label: field.label,
        })
      }
      onRestore={() =>
        onOperation({
          kind: 'put_field',
          id: field.id,
          typeId: type.id,
          archivedAt: null,
        })
      }
    />
  );
}
