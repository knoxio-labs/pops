import { type ReactNode, useMemo, useState } from 'react';

import { Button } from '@pops/ui';

import { type PreviewView } from '../../CorrectionProposalDialogPanels';
import {
  ContextHeader,
  ProposalBody,
  ProposalSubpanel,
  previewLabel,
  renderProposalBodyState,
} from './WorkflowPanels';

import type { PreviewChangeSetOutput } from '../types';
import type { CorrectionProposalWorkflowProps, useWorkflowHooks } from './useWorkflowHooks';

interface FooterProps {
  hasDirty: boolean;
  opsLength: number;
  isBusy: boolean;
  rejectMode: boolean;
  setRejectMode: (v: boolean) => void;
  canApply: boolean;
  handleApprove: () => void;
  handleClose: () => void;
}

export function ProposalFooter(props: FooterProps) {
  let stateMsg: ReactNode = null;
  if (props.hasDirty) stateMsg = <span>Preview stale — re-run before applying.</span>;
  else if (props.opsLength === 0) stateMsg = <span>ChangeSet is empty.</span>;
  return (
    <>
      <div className="flex-1 text-xs text-muted-foreground">{stateMsg}</div>
      <Button variant="outline" onClick={props.handleClose} disabled={props.isBusy}>
        Cancel
      </Button>
      {!props.rejectMode && (
        <Button
          variant="outline"
          onClick={() => props.setRejectMode(true)}
          disabled={props.isBusy || props.opsLength === 0}
        >
          Reject with feedback
        </Button>
      )}
      <Button onClick={props.handleApprove} disabled={!props.canApply}>
        Apply ChangeSet
      </Button>
    </>
  );
}

export interface ViewSelection {
  previewView: PreviewView;
  setPreviewView: React.Dispatch<React.SetStateAction<PreviewView>>;
  previewResult: PreviewChangeSetOutput | null;
  dbPreviewResult: PreviewChangeSetOutput | null;
  previewError: string | null;
  previewTruncated: boolean;
  currentPreviewLabel: string;
  excludeIds: ReadonlySet<string>;
}

export function useViewSelection(
  localOpsHook: ReturnType<typeof useWorkflowHooks>['localOpsHook'],
  previewHook: ReturnType<typeof useWorkflowHooks>['previewHook']
): ViewSelection {
  const [previewView, setPreviewView] = useState<PreviewView>('selected');
  const excludeIds = useMemo(() => {
    const set = new Set<string>();
    for (const op of localOpsHook.localOps) if (op.kind !== 'add') set.add(op.targetRuleId);
    return set;
  }, [localOpsHook.localOps]);
  const isCombined = previewView === 'combined';
  return {
    previewView,
    setPreviewView,
    previewResult: isCombined ? previewHook.combinedPreview : previewHook.selectedOpPreview,
    dbPreviewResult: isCombined ? previewHook.combinedDbPreview : previewHook.selectedOpDbPreview,
    previewError: isCombined
      ? previewHook.combinedPreviewError
      : previewHook.selectedOpPreviewError,
    previewTruncated: isCombined
      ? previewHook.combinedPreviewTruncated
      : previewHook.selectedOpPreviewTruncated,
    currentPreviewLabel: previewLabel(previewView, Boolean(localOpsHook.selectedOp)),
    excludeIds,
  };
}

export function renderBody(
  hooks: ReturnType<typeof useWorkflowHooks>,
  view: ViewSelection,
  signal: CorrectionProposalWorkflowProps['signal'],
  generating = false
): ReactNode {
  const state = renderProposalBodyState({
    signal,
    proposeQuery: hooks.proposeQuery,
    hasOps: hooks.localOpsHook.localOps.length > 0,
    generating,
  });
  if (state) return state;
  return (
    <ProposalBody
      localOpsHook={hooks.localOpsHook}
      previewHook={hooks.previewHook}
      excludeIds={view.excludeIds}
      isBusy={hooks.mutationsHook.isBusy}
      isEditorLocked={hooks.mutationsHook.isEditorLocked}
      previewView={view.previewView}
      setPreviewView={view.setPreviewView}
      currentPreviewLabel={view.currentPreviewLabel}
      previewResult={view.previewResult}
      dbPreviewResult={view.dbPreviewResult}
      dbTruncated={hooks.dbTxnsQuery.data?.truncated}
      dbTotal={hooks.dbTxnsQuery.data?.total}
      previewError={view.previewError}
      previewTruncated={view.previewTruncated}
    />
  );
}

export interface RenderHeaderArgs {
  ready: boolean;
  signal: CorrectionProposalWorkflowProps['signal'];
  triggeringTransaction: CorrectionProposalWorkflowProps['triggeringTransaction'];
  hooks: ReturnType<typeof useWorkflowHooks>;
  patternConfidence?: number | null;
}

export function renderHeader(args: RenderHeaderArgs): ReactNode {
  const { ready, signal, triggeringTransaction, hooks, patternConfidence } = args;
  if (!ready || !signal) return undefined;
  return (
    <ContextHeader
      signal={signal}
      triggeringTransaction={triggeringTransaction}
      rationale={hooks.localOpsHook.rationale}
      opCount={hooks.localOpsHook.localOps.length}
      combinedSummary={hooks.previewHook.combinedPreview?.summary ?? null}
      patternConfidence={patternConfidence ?? null}
    />
  );
}

export function renderSubpanel(m: ReturnType<typeof useWorkflowHooks>['mutationsHook']): ReactNode {
  return (
    <ProposalSubpanel
      rejectMode={m.rejectMode}
      rejectFeedback={m.rejectFeedback}
      setRejectFeedback={m.setRejectFeedback}
      setRejectMode={m.setRejectMode}
      handleConfirmReject={m.handleConfirmReject}
      rejectMutationPending={m.rejectMutationPending}
      aiMessages={m.aiMessages}
      aiInstruction={m.aiInstruction}
      setAiInstruction={m.setAiInstruction}
      handleAiSubmit={m.handleAiSubmit}
      aiBusy={m.aiBusy}
    />
  );
}

export function renderFooter(
  m: ReturnType<typeof useWorkflowHooks>['mutationsHook'],
  p: ReturnType<typeof useWorkflowHooks>['previewHook'],
  l: ReturnType<typeof useWorkflowHooks>['localOpsHook'],
  handleClose: () => void
): ReactNode {
  return (
    <ProposalFooter
      hasDirty={p.hasDirty}
      opsLength={l.localOps.length}
      isBusy={m.isBusy}
      rejectMode={m.rejectMode}
      setRejectMode={m.setRejectMode}
      canApply={m.canApply}
      handleApprove={m.handleApprove}
      handleClose={handleClose}
    />
  );
}
