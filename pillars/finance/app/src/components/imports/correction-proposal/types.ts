/**
 * Shared types for the CorrectionProposalDialog system.
 *
 * Extracted from correction-proposal-shared.ts and CorrectionProposalDialogPanels.tsx (tb-365).
 */
import type {
  CorrectionsPreviewChangeSetData,
  CorrectionsPreviewChangeSetResponse,
  CorrectionsProposeChangeSetData,
  CorrectionsProposeChangeSetResponse,
  CorrectionsRejectChangeSetData,
  CorrectionsReviseChangeSetData,
  CorrectionsReviseChangeSetResponse,
} from '../../../finance-api/index.js';
import type { TransactionType } from '../../../lib/transaction-type';
import type { CorrectionRule } from '../RulePicker';

export type CorrectionSignal = NonNullable<CorrectionsProposeChangeSetData['body']>['signal'];
export type PreviewChangeSetInput = NonNullable<CorrectionsPreviewChangeSetData['body']>;
export type PreviewChangeSetOutput = CorrectionsPreviewChangeSetResponse;
export type RejectChangeSetInput = NonNullable<CorrectionsRejectChangeSetData['body']>;
export type ReviseChangeSetInput = NonNullable<CorrectionsReviseChangeSetData['body']>;
export type ReviseChangeSetOutput = CorrectionsReviseChangeSetResponse;
export type ProposeChangeSetInput = NonNullable<CorrectionsProposeChangeSetData['body']>;
export type ProposeChangeSetOutput = CorrectionsProposeChangeSetResponse;
/**
 * One row of `PreviewChangeSetInput['transactions']` — the shape every
 * ChangeSet-preview caller builds its transaction list out of, `accountId`
 * included (POPS-2593/POPS-2975) so a scoped rule's reach is diffed under the
 * same scope the live matcher uses.
 */
export type PreviewTransactionEntry = PreviewChangeSetInput['transactions'][number];
type ServerChangeSet = ProposeChangeSetOutput['changeSet'];
type ServerChangeSetOp = ServerChangeSet['ops'][number];
export type AddRuleData = Extract<ServerChangeSetOp, { op: 'add' }>['data'];
export type EditRuleData = Extract<ServerChangeSetOp, { op: 'edit' }>['data'];

export type { ServerChangeSet, ServerChangeSetOp };

// ---------------------------------------------------------------------------
// Local op model
// ---------------------------------------------------------------------------

export type LocalOp =
  | {
      kind: 'add';
      clientId: string;
      data: AddRuleData;
      dirty: boolean;
    }
  | {
      kind: 'edit';
      clientId: string;
      targetRuleId: string;
      targetRule: CorrectionRule | null;
      data: EditRuleData;
      dirty: boolean;
    }
  | {
      kind: 'disable';
      clientId: string;
      targetRuleId: string;
      targetRule: CorrectionRule | null;
      rationale: string;
      dirty: boolean;
    }
  | {
      kind: 'remove';
      clientId: string;
      targetRuleId: string;
      targetRule: CorrectionRule | null;
      rationale: string;
      dirty: boolean;
    };

export type OpKind = LocalOp['kind'];

// ---------------------------------------------------------------------------
// Panel-specific types
// ---------------------------------------------------------------------------

export type PreviewView = 'selected' | 'combined';

export interface AiMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
}

/**
 * The transaction that triggered this proposal, plus the user's pre-correction
 * snapshot. Rendered prominently so the reviewer can reason about why the
 * proposed rule is shaped the way it is.
 */
export interface TriggeringTransactionContext {
  description: string;
  amount: number;
  date: string;
  /**
   * The real account id (POPS-2840) when the row's picked one; the
   * bank-dialect label ("Amex") only as a fallback for a pre-account-step
   * caller (POPS-2872). `AccountLabel` resolves either against the live
   * accounts list.
   */
  account: string;
  location?: string | null;
  previousEntityName?: string | null;
  previousTransactionType?: TransactionType | null;
}
