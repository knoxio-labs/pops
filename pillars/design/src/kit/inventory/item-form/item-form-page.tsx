import { useEffect } from 'react';
import { toast } from 'sonner';

import { Alert, AlertDescription, AlertTitle, PageHeader, Skeleton, Toaster } from '@pops/ui';

import { ConnectionsSection } from './connections-section';
import { CoreFieldsSection } from './core-fields-section';
import { DocumentUploadSection } from './document-upload-section';
import { FormFooter } from './form-footer';
import { NotesSection } from './notes-section';
import { PhotoUploadSection } from './photo-upload-section';
import { useItemFormState } from './use-item-form-state';

import type { ItemFormOpening } from './use-item-form-state';

function FormSkeleton() {
  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
    </div>
  );
}

function NotFoundView() {
  return (
    <div className="p-6">
      <Alert variant="destructive">
        <AlertTitle>Item not found</AlertTitle>
        <AlertDescription>This item doesn&apos;t exist.</AlertDescription>
      </Alert>
      <a
        href="#/inventory"
        className="mt-4 inline-block text-sm text-app-accent hover:text-app-accent/80 underline font-medium"
      >
        Back to inventory
      </a>
    </div>
  );
}

function buildBreadcrumbs(
  isEditMode: boolean,
  id: string | undefined,
  editItemName: string | undefined
) {
  if (isEditMode && editItemName) {
    return [
      { label: 'Inventory', href: '#/inventory' },
      { label: editItemName, href: `#/inventory/items/${id}` },
      { label: 'Edit' },
    ];
  }
  return [{ label: 'Inventory', href: '#/inventory' }, { label: 'New Item' }];
}

/**
 * A failed save reaches the user as a toast and nothing else: the source's
 * `createMutation`/`updateMutation` call `toast.error(...)` in `onError` and
 * leave no markup behind. Reproduced rather than turned into a banner, because
 * a banner is a different design, and how loudly a save failure announces
 * itself is one of the things this screen is here to have judged.
 */
function SaveErrorToast({ message }: { message: string | null }) {
  useEffect(() => {
    if (message !== null) toast.error(message);
  }, [message]);
  return <Toaster />;
}

/** `CoreFieldsSection` plus the photo and document upload sections: the record's own fields and its attachments. */
function FormFieldsAndMedia({ model }: { model: ReturnType<typeof useItemFormState> }) {
  return (
    <>
      <CoreFieldsSection
        values={model.values}
        errors={model.errors}
        assetIdError={model.assetIdError}
        assetIdChecking={model.assetIdChecking}
        generating={model.generating}
        locationTree={model.locationTree}
        onAutoGenerate={model.handleAutoGenerate}
        onValidateAssetId={model.validateAssetIdUniqueness}
        onCreateLocation={model.onCreateLocation}
        onChange={model.onChange}
      />
      <PhotoUploadSection
        isEditMode={model.isEditMode}
        existingPhotos={model.existingPhotos}
        uploadFiles={model.uploadFiles}
        imageProcessing={model.imageProcessing}
        isReordering={model.isReordering}
        deleteConfirmId={model.deleteConfirmId}
        isDeleting={model.isDeleting}
        onFilesSelected={model.handleFilesSelected}
        onRemoveUpload={model.handleRemoveUpload}
        onDeletePhoto={model.handleDeletePhoto}
        onConfirmDelete={model.confirmDeletePhoto}
        onCancelDelete={() => model.setDeleteConfirmId(null)}
        onReorder={model.onReorder}
      />
      <DocumentUploadSection
        isEditMode={model.isEditMode}
        existingDocuments={model.existingDocuments}
        uploadFiles={model.documentUploadFiles}
        deleteConfirmId={model.documentDeleteConfirmId}
        isDeleting={model.isDeletingDocument}
        isUploading={model.documentUploadFiles.some((f) => f.status === 'uploading')}
        onFilesSelected={model.handleDocumentFilesSelected}
        onRemoveUpload={model.handleDocumentRemoveUpload}
        onDeleteDocument={model.handleDeleteDocument}
        onConfirmDelete={model.confirmDeleteDocument}
        onCancelDelete={() => model.setDocumentDeleteConfirmId(null)}
      />
    </>
  );
}

/** Notes, the create-mode connections picker, and the footer/save-error that close the form. */
function FormNotesAndFooter({ model }: { model: ReturnType<typeof useItemFormState> }) {
  return (
    <>
      <NotesSection
        notes={model.values.notes}
        notesPreview={model.notesPreview}
        onChangeNotes={(v) => model.onChange('notes', v)}
        onTogglePreview={model.onToggleNotesPreview}
      />
      {!model.isEditMode && (
        <ConnectionsSection
          pendingConnections={model.pendingConnections}
          connectionSearch={model.connectionSearch}
          searchResults={model.searchResults}
          searchLoading={model.searchLoading}
          onSearchChange={model.setConnectionSearch}
          onAdd={model.onAdd}
          onRemove={model.onRemove}
        />
      )}
      <FormFooter
        isEditMode={model.isEditMode}
        isMutating={model.saving}
        onCancel={model.onCancel}
      />
      <SaveErrorToast message={model.saveError} />
    </>
  );
}

/**
 * The whole form: every section wired to one `useItemFormState` draft. The
 * source's `onSubmit` is `form.handleSubmit(onSubmit)`; without
 * react-hook-form the form's own `onSubmit` event calls the model's
 * `onSubmit` directly and prevents the default navigation a real `<form>`
 * submit would otherwise trigger.
 */
function FormBody({ model }: { model: ReturnType<typeof useItemFormState> }) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        model.onSubmit();
      }}
      className="space-y-8"
    >
      <FormFieldsAndMedia model={model} />
      <FormNotesAndFooter model={model} />
    </form>
  );
}

function ItemFormPageBody({ opening }: { opening: ItemFormOpening }) {
  const model = useItemFormState(opening);
  const editItemName = opening.item?.itemName;
  return (
    <div className="p-6 max-w-2xl">
      <PageHeader
        title={model.isEditMode ? 'Edit Item' : 'New Item'}
        backHref={
          model.isEditMode && opening.id ? `#/inventory/items/${opening.id}` : '#/inventory'
        }
        breadcrumbs={buildBreadcrumbs(model.isEditMode, opening.id, editItemName)}
        className="mb-8"
      />
      <FormBody model={model} />
    </div>
  );
}

/**
 * Renders `/inventory/items/new` (no `opening.id`) or
 * `/inventory/items/:id/edit` (`opening.id` set), matching
 * `ItemFormPage`'s own `isEditMode = !!id` branch. Edit mode additionally
 * branches on `opening.loading`/`opening.notFound` the way the source's
 * `itemsGet` query does before the form ever mounts.
 */
export function ItemFormPage({ opening = {} }: { opening?: ItemFormOpening }) {
  const isEditMode = opening.id !== undefined;
  if (isEditMode && opening.loading) return <FormSkeleton />;
  if (isEditMode && opening.notFound) return <NotFoundView />;

  return <ItemFormPageBody opening={opening} />;
}
