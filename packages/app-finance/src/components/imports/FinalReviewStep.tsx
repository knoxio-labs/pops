import { useState, useMemo } from "react";
import { ChevronDown, ChevronRight, Plus, Pencil, Ban, Trash2 } from "lucide-react";
import { Button } from "@pops/ui";
import { useImportStore } from "../../store/importStore";

// ---------------------------------------------------------------------------
// Collapsible section wrapper
// ---------------------------------------------------------------------------

function Section(props: {
  title: string;
  count: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(props.defaultOpen ?? props.count <= 10);

  return (
    <div className="border rounded-lg">
      <button
        type="button"
        className="flex w-full items-center justify-between px-4 py-3 text-left font-medium hover:bg-muted/50"
        onClick={() => setOpen(!open)}
      >
        <span>
          {props.title} <span className="text-muted-foreground font-normal">({props.count})</span>
        </span>
        {open ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        )}
      </button>
      {open && <div className="border-t px-4 py-3">{props.children}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Op badge
// ---------------------------------------------------------------------------

const OP_BADGE: Record<string, { label: string; icon: React.ReactNode; className: string }> = {
  add: {
    label: "Add",
    icon: <Plus className="h-3 w-3" />,
    className: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300",
  },
  edit: {
    label: "Edit",
    icon: <Pencil className="h-3 w-3" />,
    className: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300",
  },
  disable: {
    label: "Disable",
    icon: <Ban className="h-3 w-3" />,
    className: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300",
  },
  remove: {
    label: "Remove",
    icon: <Trash2 className="h-3 w-3" />,
    className: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300",
  },
};

// ---------------------------------------------------------------------------
// FinalReviewStep — PRD-031 US-01+02
// ---------------------------------------------------------------------------

/**
 * Step 6: Final Review & Commit — read-only summary of all pending changes.
 */
export function FinalReviewStep() {
  const {
    pendingEntities,
    pendingChangeSets,
    confirmedTransactions,
    processedTransactions,
    prevStep,
    nextStep,
  } = useImportStore();

  // Transaction breakdown
  const txnBreakdown = useMemo(() => {
    const matched = processedTransactions.matched.length;
    const uncertain = processedTransactions.uncertain.length;
    const failed = processedTransactions.failed.length;
    const skipped = processedTransactions.skipped.length;
    return { matched, uncertain, failed, skipped, total: confirmedTransactions.length };
  }, [processedTransactions, confirmedTransactions]);

  // Tag assignment count
  const tagAssignmentCount = useMemo(() => {
    return confirmedTransactions.reduce((sum, txn) => sum + (txn.tags?.length ?? 0), 0);
  }, [confirmedTransactions]);

  // Total op count across all ChangeSets
  const totalOps = useMemo(
    () => pendingChangeSets.reduce((sum, pcs) => sum + pcs.changeSet.ops.length, 0),
    [pendingChangeSets]
  );

  const hasEntities = pendingEntities.length > 0;
  const hasRuleChanges = totalOps > 0;
  const hasTransactions = txnBreakdown.total > 0;
  const hasTags = tagAssignmentCount > 0;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold mb-2">Final Review</h2>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Review all pending changes before committing. Navigate back to make edits.
        </p>
      </div>

      <div className="space-y-4">
        {/* New entities */}
        {hasEntities && (
          <Section title="New Entities" count={pendingEntities.length}>
            <ul className="space-y-1">
              {pendingEntities.map((entity) => (
                <li key={entity.tempId} className="flex items-center gap-2 text-sm py-1">
                  <span className="font-medium">{entity.name}</span>
                  <span className="text-muted-foreground text-xs">({entity.type})</span>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {/* Rule changes */}
        {hasRuleChanges && (
          <Section title="Rule Changes" count={totalOps}>
            <div className="space-y-3">
              {pendingChangeSets.map((pcs) => (
                <div key={pcs.tempId} className="space-y-1">
                  {pcs.changeSet.source && (
                    <p className="text-xs text-muted-foreground">Source: {pcs.changeSet.source}</p>
                  )}
                  <ul className="space-y-1">
                    {pcs.changeSet.ops.map((op, idx) => {
                      const badge = OP_BADGE[op.op];
                      const pattern =
                        op.op === "add"
                          ? op.data.descriptionPattern
                          : op.op === "edit"
                            ? op.id
                            : "id" in op
                              ? op.id
                              : "";
                      return (
                        <li key={idx} className="flex items-center gap-2 text-sm py-0.5">
                          {badge && (
                            <span
                              className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium ${badge.className}`}
                            >
                              {badge.icon}
                              {badge.label}
                            </span>
                          )}
                          <span className="font-mono text-xs truncate">{pattern}</span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* Transactions */}
        {hasTransactions && (
          <Section title="Transactions to Import" count={txnBreakdown.total}>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Matched:</span>
                <span className="font-medium">{txnBreakdown.matched}</span>
              </div>
              {txnBreakdown.uncertain > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Uncertain:</span>
                  <span className="font-medium">{txnBreakdown.uncertain}</span>
                </div>
              )}
              {txnBreakdown.failed > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Failed:</span>
                  <span className="font-medium">{txnBreakdown.failed}</span>
                </div>
              )}
              {txnBreakdown.skipped > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Skipped:</span>
                  <span className="font-medium">{txnBreakdown.skipped}</span>
                </div>
              )}
            </div>
          </Section>
        )}

        {/* Tag assignments */}
        {hasTags && (
          <Section title="Tag Assignments" count={tagAssignmentCount}>
            <p className="text-sm text-muted-foreground">
              {tagAssignmentCount} tag{tagAssignmentCount === 1 ? "" : "s"} will be applied across{" "}
              {confirmedTransactions.filter((t) => (t.tags?.length ?? 0) > 0).length} transaction
              {confirmedTransactions.filter((t) => (t.tags?.length ?? 0) > 0).length === 1
                ? ""
                : "s"}
              .
            </p>
          </Section>
        )}

        {/* Empty state */}
        {!hasEntities && !hasRuleChanges && !hasTransactions && !hasTags && (
          <p className="text-sm text-muted-foreground text-center py-8">
            No pending changes to review.
          </p>
        )}
      </div>

      <div className="flex justify-between pt-4">
        <Button variant="outline" onClick={prevStep}>
          Back
        </Button>
        <Button onClick={nextStep}>Continue to Import</Button>
      </div>
    </div>
  );
}
