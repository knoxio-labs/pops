import { useState } from 'react';
import { useParams } from 'react-router';

import { useCatalogueEditor } from '../catalogue-editor/useCatalogueEditor';
import {
  useCataloguePageActions,
  useCataloguePageData,
  useCataloguePageNavigation,
} from './CataloguePageState';

import type { ArchiveTarget, EditorMode } from './cataloguePageTypes';

/**
 * Provides catalogue page selection and mutation behaviour independently from its layout.
 * A `:id` route parameter selects the matching type and is reconciled during render when
 * navigation changes the parameter without remounting the page.
 */
export function useTypeCataloguePage() {
  const { mode, selectedFieldId, setMode, setSelectedFieldId, setStoredTypeId, storedTypeId } =
    useTypeRouteState();
  const model = useCatalogueEditor();
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
    editorEpoch: model.editorEpoch,
    error: model.error,
    isPending: model.isPending,
    issues: model.issues,
    loading: model.isLoading,
    openAudit: () => setAuditOpen(true),
    published: model.published,
    previewOperation: model.previewOperation,
    readiness: model.readiness,
    recheckCompatibility: model.recheckCompatibility,
    reload: model.reload,
    setArchiveTarget,
    setAuditOpen,
    setMode,
    mode,
  };
}

function useTypeRouteState() {
  const { id } = useParams<{ id?: string }>();
  const [lastSeenId, setLastSeenId] = useState(id);
  const [storedTypeId, setStoredTypeId] = useState<string | null>(id ?? null);
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [mode, setMode] = useState<EditorMode>('type');
  if (id !== lastSeenId) {
    setLastSeenId(id);
    setStoredTypeId(id ?? null);
    setSelectedFieldId(null);
    setMode('type');
  }
  return {
    mode,
    selectedFieldId,
    setMode,
    setSelectedFieldId,
    setStoredTypeId,
    storedTypeId,
  };
}
