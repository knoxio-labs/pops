import {
  addRuleOp,
  disableRuleOp,
  editRuleOp,
  existingImpact,
  existingImpactTruncated,
  filledDisableRationale,
  importImpact,
  type CorrectionOpFixture,
  type ImpactResultFixture,
} from '@/fixtures/import-correction';
import {
  AiHelperBar,
  CorrectionFooter,
  CorrectionHeader,
  ImpactPanel,
  RejectPanel,
} from '@/kit/correction-proposal-impact';
import { DetailPanel, OpsList } from '@/kit/correction-proposal-ops';

import { WorkflowDialog } from '@pops/ui';

import type { ScreenMeta, ScreenStates } from '@/contract';

/**
 * The correction-proposal workflow dialog — opened mid-Review when a user
 * overrides an entity the matcher chose on its own. A standalone leaf
 * screen rather than a flow step: the dialog can open from several places
 * in the import wizard, it isn't one numbered stage of it. Maps
 * `pillars/finance/app/src/components/imports/correction-proposal/`; a
 * simplified but faithful static render, no interactivity.
 */
export const meta: ScreenMeta = { title: 'Import — correction proposal', order: 3, frame: 'web' };

function Screen({
  op,
  view = 'selected',
  existing = existingImpact,
  aiActive = false,
  rejecting = false,
  disableRationale = '',
}: {
  op: CorrectionOpFixture;
  view?: 'selected' | 'combined';
  existing?: ImpactResultFixture | (ImpactResultFixture & { dbTotal: number });
  aiActive?: boolean;
  rejecting?: boolean;
  disableRationale?: string;
}) {
  return (
    <WorkflowDialog
      open
      onOpenChange={() => undefined}
      title="Correction proposal"
      description="Edit the proposed rule changes and preview their impact before applying."
      columns={3}
      header={<CorrectionHeader />}
      subpanel={rejecting ? <RejectPanel /> : <AiHelperBar active={aiActive} />}
      footer={<CorrectionFooter rejecting={rejecting} />}
    >
      <OpsList selectedId={op.clientId} />
      <DetailPanel op={op} rationale={disableRationale} />
      <ImpactPanel view={view} importResult={importImpact} existing={existing} />
    </WorkflowDialog>
  );
}

export default function ImportCorrectionProposal() {
  return <Screen op={editRuleOp} />;
}

export const states: ScreenStates = {
  'editing-existing-rule': () => <Screen op={editRuleOp} />,
  'add-new-rule': () => <Screen op={addRuleOp} />,
  'disable-with-rationale': () => (
    <Screen op={disableRuleOp} disableRationale={filledDisableRationale} />
  ),
  'truncated-impact': () => (
    <Screen op={editRuleOp} existing={existingImpactTruncated} view="combined" />
  ),
  'ai-helper-active': () => <Screen op={editRuleOp} aiActive />,
  rejecting: () => <Screen op={editRuleOp} rejecting />,
};
