import { useState } from 'react';

import { useCatalogueEditor } from '../catalogue-editor/useCatalogueEditor';
import {
  useCataloguePageActions,
  useCataloguePageData,
  useCataloguePageNavigation,
} from './CataloguePageState';

import type { ArchiveTarget, EditorMode } from './cataloguePageTypes';

/** Provides catalogue page selection and mutation behaviour independently from its layout. */
export function useTypeCataloguePage() {
  const model = useCatalogueEditor();
  const [storedTypeId, setStoredTypeId] = useState<string | null>(null);
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [mode, setMode] = useState<EditorMode>('type');
  const [auditOpen, setAuditOpen] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState<ArchiveTarget | null>(null);
  const data = useCataloguePageData(
    model.catalogue?.types,
    model.published?.types,
    storedTypeId,
    selectedFieldId
  );
  const actions = useCataloguePageActions({
    model,
    data,
    mode,
    selectedTypeId: data.selectedTypeId,
    setMode,
    setSelectedFieldId,
    setStoredTypeId,
  });
  const navigation = useCataloguePageNavigation({
    fields: data.fields,
    onOperation: actions.applyOperation,
    selectedType: data.selectedType,
    setMode,
    setSelectedFieldId,
    setStoredTypeId,
  });
  return {
    ...actions,
    ...data,
    ...navigation,
    archiveTarget,
    auditOpen,
    catalogue: model.catalogue,
    compatibility: model.compatibility,
    error: model.error,
    isPending: model.isPending,
    loading: model.isLoading,
    openAudit: () => setAuditOpen(true),
    published: model.published,
    reload: model.reload,
    setArchiveTarget,
    setAuditOpen,
    setMode,
    mode,
  };
}
