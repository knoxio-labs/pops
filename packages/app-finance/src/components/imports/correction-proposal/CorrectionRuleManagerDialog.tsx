import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import { trpc } from '@pops/api-client';
import { WorkflowDialog } from '@pops/ui';

import { useImportStore } from '../../../store/importStore';
import { type PreviewView } from '../CorrectionProposalDialogPanels';
import { localOpsToChangeSet, useLocalOps } from '../hooks/useLocalOps';
import { usePreviewEffects } from '../hooks/usePreviewEffects';
import { RuleManagerFooter } from './rule-manager/Footer';
import { RuleManagerBody } from './rule-manager/RuleManagerBody';
import { useBrowseRules } from './rule-manager/useBrowseRules';
import { useBrowseSelection } from './rule-manager/useBrowseSelection';

export interface CorrectionRuleManagerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onBrowseClose?: (hadChanges: boolean) => void;
  minConfidence: number;
  previewTransactions: Array<{ checksum?: string; description: string }>;
}

interface CleanupArgs {
  setBrowseSearch: (v: string) => void;
  setBrowseSelectedRuleId: (v: string | null) => void;
  setLocalOps: (v: never[]) => void;
  setSelectedClientId: (v: string | null) => void;
  setPreviewView: (v: PreviewView) => void;
  resetPreviewState: () => void;
}

function buildOpenChangeHandler(
  onOpenChange: (v: boolean) => void,
  onBrowseClose: ((hadChanges: boolean) => void) | undefined,
  initialPendingCountRef: React.MutableRefObject<number>,
  cleanup: CleanupArgs
) {
  return (nextOpen: boolean) => {
    if (nextOpen) {
      onOpenChange(true);
      return;
    }
    const currentCount = useImportStore.getState().pendingChangeSets.length;
    const hadChanges = currentCount !== initialPendingCountRef.current;
    cleanup.setBrowseSearch('');
    cleanup.setBrowseSelectedRuleId(null);
    cleanup.setLocalOps([]);
    cleanup.setSelectedClientId(null);
    cleanup.setPreviewView('selected');
    cleanup.resetPreviewState();
    onOpenChange(false);
    onBrowseClose?.(hadChanges);
  };
}

function useDialogState(open: boolean) {
  const [previewView, setPreviewView] = useState<PreviewView>('selected');
  const [browseSearch, setBrowseSearch] = useState('');
  const browseInitialPendingCountRef = useRef<number>(0);
  useEffect(() => {
    if (open) {
      browseInitialPendingCountRef.current = useImportStore.getState().pendingChangeSets.length;
    }
  }, [open]);
  return {
    previewView,
    setPreviewView,
    browseSearch,
    setBrowseSearch,
    browseInitialPendingCountRef,
  };
}

function useRuleManagerHooks(props: CorrectionRuleManagerDialogProps) {
  const { open, minConfidence, previewTransactions } = props;
  const pendingChangeSets = useImportStore((s) => s.pendingChangeSets);
  const localOpsHook = useLocalOps({
    open,
    signal: null,
    isBrowseMode: true,
    proposeData: undefined,
  });
  const dialogState = useDialogState(open);
  const dbTxnsQuery = trpc.finance.transactions.listDescriptionsForPreview.useQuery(undefined, {
    enabled: open,
    staleTime: 60_000,
  });
  const previewHook = usePreviewEffects(
    {
      open,
      localOps: localOpsHook.localOps,
      selectedOp: localOpsHook.selectedOp,
      minConfidence,
      previewTransactions,
      dbTransactions: dbTxnsQuery.data?.data ?? [],
      pendingChangeSets,
    },
    localOpsHook.setLocalOps
  );
  const browse = useBrowseRules({
    open,
    localOps: localOpsHook.localOps,
    browseSearch: dialogState.browseSearch,
    setLocalOps: localOpsHook.setLocalOps,
  });
  const selection = useBrowseSelection({
    setLocalOps: localOpsHook.setLocalOps,
    setSelectedClientId: localOpsHook.setSelectedClientId,
    localOps: localOpsHook.localOps,
  });
  const browseSelectedRule = useMemo(
    () => browse.browseMergedRules.find((r) => r.id === selection.browseSelectedRuleId) ?? null,
    [browse.browseMergedRules, selection.browseSelectedRuleId]
  );
  return {
    localOpsHook,
    dialogState,
    dbTxnsQuery,
    previewHook,
    browse,
    selection,
    browseSelectedRule,
  };
}

function buildBodyProps(
  hooks: ReturnType<typeof useRuleManagerHooks>,
  handleAddNewRuleOp: () => void
) {
  const {
    localOpsHook,
    dialogState,
    dbTxnsQuery,
    previewHook,
    browse,
    selection,
    browseSelectedRule,
  } = hooks;
  return {
    errorMessage: browse.browseListQuery.isError ? browse.browseListQuery.error.message : null,
    isLoading: browse.browseListQuery.isLoading,
    search: dialogState.browseSearch,
    onSearchChange: dialogState.setBrowseSearch,
    orderedMerged: browse.browseOrderedMerged,
    orderedFiltered: browse.browseOrderedFiltered,
    canDragReorder: browse.browseCanDragReorder,
    selectedRuleId: selection.browseSelectedRuleId,
    onSelectRule: selection.handleBrowseSelectRule,
    onReorderFullList: browse.handleBrowseReorderFullList,
    localOps: localOpsHook.localOps,
    selectedOp: localOpsHook.selectedOp,
    onChangeSelectedOp: localOpsHook.updateOp,
    selectedRule: browseSelectedRule,
    onEditRule: selection.handleBrowseEditRule,
    onDisableRule: selection.handleBrowseDisableRule,
    onRemoveRule: selection.handleBrowseRemoveRule,
    onAddNewRule: handleAddNewRuleOp,
    previewView: dialogState.previewView,
    onPreviewViewChange: dialogState.setPreviewView,
    previewCombined: previewHook.combinedPreview,
    previewSelected: previewHook.selectedOpPreview,
    dbPreviewCombined: previewHook.combinedDbPreview,
    dbPreviewSelected: previewHook.selectedOpDbPreview,
    previewErrorCombined: previewHook.combinedPreviewError,
    previewErrorSelected: previewHook.selectedOpPreviewError,
    truncatedCombined: previewHook.combinedPreviewTruncated,
    truncatedSelected: previewHook.selectedOpPreviewTruncated,
    dbTruncated: dbTxnsQuery.data?.truncated,
    dbTotal: dbTxnsQuery.data?.total,
    isPreviewPending: previewHook.previewMutationPending,
    isPreviewStale: previewHook.hasDirty,
    onRerunPreview: previewHook.handleRerunPreview,
    disablePreview: localOpsHook.localOps.length === 0,
  };
}

export function CorrectionRuleManagerDialog(props: CorrectionRuleManagerDialogProps) {
  const { open, onOpenChange, onBrowseClose } = props;
  const addPendingChangeSet = useImportStore((s) => s.addPendingChangeSet);
  const hooks = useRuleManagerHooks(props);
  const { localOpsHook, dialogState, previewHook, browse, selection } = hooks;
  const { localOps, setLocalOps, setSelectedClientId, handleAddNewRuleOp } = localOpsHook;

  const handleOpenChange = useCallback(
    buildOpenChangeHandler(onOpenChange, onBrowseClose, dialogState.browseInitialPendingCountRef, {
      setBrowseSearch: dialogState.setBrowseSearch,
      setBrowseSelectedRuleId: selection.setBrowseSelectedRuleId,
      setLocalOps: setLocalOps as never,
      setSelectedClientId,
      setPreviewView: dialogState.setPreviewView,
      resetPreviewState: previewHook.resetPreviewState,
    }),
    [
      onOpenChange,
      onBrowseClose,
      dialogState,
      selection.setBrowseSelectedRuleId,
      setLocalOps,
      setSelectedClientId,
      previewHook.resetPreviewState,
    ]
  );

  const handleBrowseSave = useCallback(() => {
    if (localOps.length === 0) {
      handleOpenChange(false);
      return;
    }
    const changeSet = localOpsToChangeSet(localOps, { source: 'browse-rule-manager' });
    if (changeSet) {
      addPendingChangeSet({ changeSet, source: 'browse-rule-manager' });
      toast.success(`${localOps.length} rule change${localOps.length === 1 ? '' : 's'} saved`);
    }
    handleOpenChange(false);
  }, [addPendingChangeSet, handleOpenChange, localOps]);

  const isGridMode = !browse.browseListQuery.isError && !browse.browseListQuery.isLoading;
  const bodyProps = buildBodyProps(hooks, handleAddNewRuleOp);

  return (
    <WorkflowDialog
      open={open}
      onOpenChange={handleOpenChange}
      title="Manage Rules"
      description="Browse, search, and edit classification rules. Changes are buffered locally until import is committed."
      columns={isGridMode ? 3 : undefined}
      gridTemplate={isGridMode ? 'grid-cols-[300px_minmax(0,1fr)_360px]' : undefined}
      footer={
        <RuleManagerFooter
          localOpsCount={localOps.length}
          onCancel={() => handleOpenChange(false)}
          onSave={handleBrowseSave}
        />
      }
    >
      <RuleManagerBody {...bodyProps} />
    </WorkflowDialog>
  );
}
