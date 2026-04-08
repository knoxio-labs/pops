import { useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Button,
  Textarea,
  Badge,
  Separator,
} from "@pops/ui";
import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";
import { toast } from "sonner";
import type { AppRouter } from "@pops/api-client";
import { trpc } from "../../lib/trpc";

type CorrectionSignal =
  inferRouterInputs<AppRouter>["core"]["corrections"]["proposeChangeSet"]["signal"];
type ApplyChangeSetAndReevaluateOutput =
  inferRouterOutputs<AppRouter>["finance"]["imports"]["applyChangeSetAndReevaluate"];

export interface CorrectionProposalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessionId: string;
  signal: CorrectionSignal | null;
  /** Import-session descriptions used for deterministic previewChangeSet */
  previewTransactions: Array<{ checksum?: string; description: string }>;
  minConfidence?: number;
  onApproved?: (result: ApplyChangeSetAndReevaluateOutput["result"], affectedCount: number) => void;
}

function opLabel(op: { op: string }): string {
  if (op.op === "add") return "Add rule";
  if (op.op === "edit") return "Edit rule";
  if (op.op === "disable") return "Disable rule";
  if (op.op === "remove") return "Remove rule";
  return op.op;
}

export function CorrectionProposalDialog(props: CorrectionProposalDialogProps) {
  const [feedback, setFeedback] = useState("");
  const [activeTab, setActiveTab] = useState<"preview" | "ops">("preview");

  const minConfidence = props.minConfidence ?? 0.7;

  const disabledSignal: CorrectionSignal = useMemo(
    () => ({ descriptionPattern: "_", matchType: "exact", tags: [] }),
    []
  );

  const safePreviewTransactions = useMemo(() => {
    // API limits previewChangeSet to max 500 items
    return props.previewTransactions.slice(0, 500);
  }, [props.previewTransactions]);

  const proposeInput = useMemo(() => {
    if (!props.signal) return null;
    return { signal: props.signal, minConfidence, maxPreviewItems: 200 };
  }, [props.signal, minConfidence]);

  const proposeQuery = trpc.core.corrections.proposeChangeSet.useQuery(
    proposeInput ?? { signal: disabledSignal, minConfidence, maxPreviewItems: 200 },
    {
      enabled: Boolean(props.open && proposeInput),
      staleTime: 0,
      retry: false,
    }
  );

  const changeSet = proposeQuery.data?.changeSet ?? null;

  const previewInput = useMemo(() => {
    if (!changeSet) return null;
    return { changeSet, transactions: safePreviewTransactions, minConfidence };
  }, [changeSet, safePreviewTransactions, minConfidence]);

  const disabledChangeSet = useMemo(
    () => ({
      source: "disabled",
      reason: "disabled",
      ops: [{ op: "add" as const, data: { descriptionPattern: "_", matchType: "exact" as const } }],
    }),
    []
  );

  const previewQuery = trpc.core.corrections.previewChangeSet.useQuery(
    previewInput ?? { changeSet: disabledChangeSet, transactions: [], minConfidence },
    {
      enabled: Boolean(props.open && previewInput && safePreviewTransactions.length > 0),
      staleTime: 0,
      retry: false,
    }
  );

  const applyMutation = trpc.finance.imports.applyChangeSetAndReevaluate.useMutation({
    onSuccess: (res) => {
      toast.success("Rules applied");
      props.onApproved?.(res.result, res.affectedCount);
      props.onOpenChange(false);
      setFeedback("");
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const rejectMutation = trpc.core.corrections.rejectChangeSet.useMutation({
    onSuccess: () => {
      toast.success("Proposal rejected");
      setFeedback("");
      proposeQuery.refetch();
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const summary = previewQuery.data?.summary ?? null;

  const isBusy =
    proposeQuery.isFetching ||
    previewQuery.isFetching ||
    applyMutation.isPending ||
    rejectMutation.isPending;

  const handleApprove = () => {
    if (!changeSet) return;
    if (!props.sessionId) {
      toast.error("Missing import session id");
      return;
    }
    applyMutation.mutate({ sessionId: props.sessionId, changeSet, minConfidence });
  };

  const handleReject = () => {
    if (!props.signal || !changeSet) return;
    const trimmed = feedback.trim();
    if (!trimmed) return;
    rejectMutation.mutate({
      signal: props.signal,
      changeSet,
      feedback: trimmed,
      impactSummary: summary ?? undefined,
    });
  };

  const handleOpenChange = (open: boolean) => {
    props.onOpenChange(open);
    if (!open) {
      setFeedback("");
      setActiveTab("preview");
    }
  };

  return (
    <Dialog open={props.open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Correction proposal</DialogTitle>
          <DialogDescription>
            Review the proposed rule changes and their impact before approving.
          </DialogDescription>
        </DialogHeader>

        {!props.signal ? (
          <div className="text-sm text-muted-foreground">No proposal signal provided.</div>
        ) : proposeQuery.isError ? (
          <div className="text-sm text-destructive">{proposeQuery.error.message}</div>
        ) : !changeSet ? (
          <div className="text-sm text-muted-foreground">Generating proposal…</div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">
                {changeSet.ops.length} op{changeSet.ops.length === 1 ? "" : "s"}
              </Badge>
              {summary && (
                <>
                  <Badge variant="secondary">{summary.total} transactions checked</Badge>
                  <Badge variant="secondary">{summary.newMatches} new matches</Badge>
                  <Badge variant="secondary">{summary.removedMatches} removed</Badge>
                  <Badge variant="secondary">{summary.statusChanges} status changes</Badge>
                </>
              )}
            </div>

            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "preview" | "ops")}>
              <TabsList>
                <TabsTrigger value="preview">Impact preview</TabsTrigger>
                <TabsTrigger value="ops">ChangeSet ops</TabsTrigger>
              </TabsList>

              <TabsContent value="preview" className="space-y-3">
                {safePreviewTransactions.length === 0 ? (
                  <div className="text-sm text-muted-foreground">
                    No transactions available for preview.
                  </div>
                ) : previewQuery.isError ? (
                  <div className="text-sm text-destructive">{previewQuery.error.message}</div>
                ) : !previewQuery.data ? (
                  <div className="text-sm text-muted-foreground">Computing preview…</div>
                ) : (
                  <div className="space-y-2">
                    <div className="text-sm text-muted-foreground">
                      Showing deterministic preview against the current import session.
                    </div>
                    <Separator />
                    <div className="max-h-64 overflow-auto space-y-2">
                      {previewQuery.data.diffs
                        .filter((d) => d.changed)
                        .slice(0, 50)
                        .map((d) => (
                          <div key={d.checksum ?? d.description} className="text-sm">
                            <div className="font-medium">{d.description}</div>
                            <div className="text-xs text-muted-foreground">
                              before:{" "}
                              {d.before.matched
                                ? `${d.before.status} (${d.before.confidence ?? "?"})`
                                : "unmatched"}{" "}
                              → after:{" "}
                              {d.after.matched
                                ? `${d.after.status} (${d.after.confidence ?? "?"})`
                                : "unmatched"}
                            </div>
                          </div>
                        ))}
                    </div>
                    {previewQuery.data.diffs.filter((d) => d.changed).length > 50 && (
                      <div className="text-xs text-muted-foreground">Showing first 50 changes.</div>
                    )}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="ops" className="space-y-2">
                <div className="text-sm text-muted-foreground">{proposeQuery.data?.rationale}</div>
                <Separator />
                <div className="space-y-2">
                  {changeSet.ops.map((op, idx) => (
                    <div key={idx} className="rounded-md border p-3">
                      <div className="font-medium text-sm">{opLabel(op)}</div>
                      <pre className="mt-2 text-xs bg-muted p-2 rounded overflow-auto">
                        {JSON.stringify(op, null, 2)}
                      </pre>
                    </div>
                  ))}
                </div>
              </TabsContent>
            </Tabs>

            <div className="space-y-2">
              <div className="text-sm font-medium">Reject feedback (required to reject)</div>
              <Textarea
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                placeholder="Why is this proposal wrong? (e.g. too broad, wrong entity, should be exact match)"
                rows={3}
              />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={isBusy}>
            Close
          </Button>
          <Button
            variant="outline"
            onClick={handleReject}
            disabled={isBusy || !props.signal || !changeSet || feedback.trim().length === 0}
          >
            Reject
          </Button>
          <Button onClick={handleApprove} disabled={isBusy || !changeSet || !props.sessionId}>
            {applyMutation.isPending ? "Applying & re-evaluating…" : "Approve"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
