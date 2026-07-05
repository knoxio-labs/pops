import { useMutation, type UseMutationResult } from '@tanstack/react-query';
import { useCallback, useRef, useState } from 'react';
import { toast } from 'sonner';

import { unwrap } from '../../../finance-api-helpers.js';
import { correctionsAnalyzeCorrection } from '../../../finance-api/index.js';

import type { ProcessedTransaction } from '../../../store/importStore';

interface AnalyzeCorrectionInput {
  description: string;
  entityName: string;
  amount: number;
}

interface AnalyzeCorrectionOutput {
  data: {
    pattern: string;
    matchType: 'exact' | 'contains' | 'regex';
    /** The AI's reported confidence (0.0-1.0) that this pattern is correct (CF038/#3655). */
    confidence: number;
  } | null;
}

type AnalyzeCorrectionMutation = UseMutationResult<
  AnalyzeCorrectionOutput,
  Error,
  AnalyzeCorrectionInput
>;

export interface ProposalSignal {
  descriptionPattern: string;
  matchType: 'exact' | 'contains' | 'regex';
  entityId?: string | null;
  entityName?: string | null;
  location?: string | null;
  tags?: string[];
  transactionType?: 'purchase' | 'transfer' | 'income' | null;
}

export interface TriggeringTransaction {
  description: string;
  amount: number;
  date: string;
  account: string;
  location?: string | null;
  previousEntityName?: string | null;
  previousTransactionType?: 'purchase' | 'transfer' | 'income' | null;
}

function computeFallbackPattern(description: string): string {
  return description.toUpperCase().replaceAll(/\d+/g, '').replaceAll(/\s+/g, ' ').trim();
}

function buildTriggeringContext(transaction: ProcessedTransaction): TriggeringTransaction {
  return {
    description: transaction.description,
    amount: transaction.amount,
    date: transaction.date,
    account: transaction.account,
    location: transaction.location ?? null,
    previousEntityName: transaction.entity?.entityName ?? null,
    previousTransactionType: transaction.transactionType ?? null,
  };
}

interface GenerateArgs {
  triggeringTransaction: ProcessedTransaction;
  entityId: string | null;
  entityName: string | null;
  location?: string | null;
  transactionType?: 'purchase' | 'transfer' | 'income' | null;
}

interface GenerateDeps {
  analyzeCorrectionMutation: AnalyzeCorrectionMutation;
  setProposalSignal: React.Dispatch<React.SetStateAction<ProposalSignal | null>>;
  setProposalTriggeringTransaction: React.Dispatch<
    React.SetStateAction<TriggeringTransaction | null>
  >;
  setProposalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setProposalConfidence: React.Dispatch<React.SetStateAction<number | null>>;
}

async function runGenerate(args: GenerateArgs, deps: GenerateDeps): Promise<void> {
  const originalDescription = args.triggeringTransaction.description;
  const originalAmount = args.triggeringTransaction.amount;
  const fallbackPattern = computeFallbackPattern(originalDescription);
  const triggeringContext = buildTriggeringContext(args.triggeringTransaction);
  const baseSignal = {
    entityId: args.entityId,
    entityName: args.entityName,
    location: args.location ?? null,
    transactionType: args.transactionType ?? null,
    tags: [] as string[],
  };
  try {
    const res = await deps.analyzeCorrectionMutation.mutateAsync({
      description: originalDescription,
      entityName: args.entityName ?? 'unknown',
      amount: originalAmount,
    });
    const analysis = res.data;
    const useAi = analysis && analysis.pattern.length >= 3;
    deps.setProposalSignal({
      descriptionPattern: useAi ? analysis.pattern : fallbackPattern,
      matchType: useAi ? analysis.matchType : 'contains',
      ...baseSignal,
    });
    deps.setProposalTriggeringTransaction(triggeringContext);
    // Only the AI-derived pattern carries a model confidence — the fallback
    // pattern is a deterministic heuristic with nothing to report (CF038/#3655).
    deps.setProposalConfidence(useAi ? analysis.confidence : null);
    deps.setProposalOpen(true);
    toast.success('Proposal generated — review and approve to learn');
  } catch {
    deps.setProposalSignal({
      descriptionPattern: fallbackPattern,
      matchType: 'contains',
      ...baseSignal,
    });
    deps.setProposalTriggeringTransaction(triggeringContext);
    deps.setProposalConfidence(null);
    deps.setProposalOpen(true);
    toast.info('Proposal generated (fallback) — review and approve to learn');
  }
}

/**
 * Immediate feedback: open the window in a loading state before the
 * round-trip so the click is never a silent wait. Clearing the prior signal
 * (and confidence) keeps a stale proposal from flashing under the loader.
 */
function openGeneratingWindow(deps: GenerateDeps): void {
  deps.setProposalSignal(null);
  deps.setProposalTriggeringTransaction(null);
  deps.setProposalConfidence(null);
  deps.setProposalOpen(true);
}

/**
 * Manages proposal generation, correction analysis, and the proposal/browse
 * dialog state for the ReviewStep.
 */
export function useProposalGeneration() {
  const [proposalOpen, setProposalOpen] = useState(false);
  const [proposalSignal, setProposalSignal] = useState<ProposalSignal | null>(null);
  const [proposalTriggeringTransaction, setProposalTriggeringTransaction] =
    useState<TriggeringTransaction | null>(null);
  const [proposalConfidence, setProposalConfidence] = useState<number | null>(null);
  const [browseOpen, setBrowseOpen] = useState(false);
  const [isGeneratingProposal, setIsGeneratingProposal] = useState(false);
  const inFlightRef = useRef(false);

  const analyzeCorrectionMutation = useMutation({
    mutationFn: async (vars: AnalyzeCorrectionInput): Promise<AnalyzeCorrectionOutput> =>
      unwrap(await correctionsAnalyzeCorrection({ body: vars })),
  });

  const generateProposal = useCallback(
    async (args: GenerateArgs) => {
      // Serialize: analysis is a 2-3s round-trip. A second accept/create while
      // one is in flight would clobber the window that is about to open, so the
      // ref (read synchronously, unlike state) turns concurrent calls into
      // no-ops until the pending proposal resolves or errors.
      if (inFlightRef.current) return;
      inFlightRef.current = true;
      setIsGeneratingProposal(true);
      const deps: GenerateDeps = {
        analyzeCorrectionMutation,
        setProposalSignal,
        setProposalTriggeringTransaction,
        setProposalOpen,
        setProposalConfidence,
      };
      openGeneratingWindow(deps);
      try {
        await runGenerate(args, deps);
      } finally {
        inFlightRef.current = false;
        setIsGeneratingProposal(false);
      }
    },
    [analyzeCorrectionMutation]
  );

  const openRuleProposalDialog = useCallback(
    (triggeringTransaction: ProcessedTransaction, entityId: string, entityName: string) => {
      void generateProposal({ triggeringTransaction, entityId, entityName });
    },
    [generateProposal]
  );

  const handleProposalOpenChange = useCallback((nextOpen: boolean) => {
    // Ignore close requests (overlay click / Esc / close button) while the
    // analysis is in flight: the loading window is the only feedback, and
    // runGenerate() would re-open it moments later, so a mid-generation close
    // just flickers the dialog. Opening is always allowed.
    if (!nextOpen && inFlightRef.current) return;
    setProposalOpen(nextOpen);
  }, []);

  return {
    proposalOpen,
    setProposalOpen,
    handleProposalOpenChange,
    proposalSignal,
    proposalTriggeringTransaction,
    proposalConfidence,
    browseOpen,
    setBrowseOpen,
    isGeneratingProposal,
    generateProposal,
    openRuleProposalDialog,
  };
}
