import { aiHelperTranscript, type ImpactResultFixture } from '@/fixtures/import-correction';
import { RefreshCw, Sparkles } from 'lucide-react';

import { Badge, Button, Input, Label, Textarea } from '@pops/ui';

/**
 * The correction-proposal dialog's right column (the impact preview) and
 * the bars docked above and below it — the header context strip, the AI
 * helper bar, the reject-feedback panel and the footer. See
 * `correction-proposal-ops` for the left/middle columns.
 */

function ImpactContent({ result }: { result: ImpactResultFixture }) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        <Badge variant="secondary" className="text-2xs">
          {result.total} checked
        </Badge>
        <Badge variant="secondary" className="text-2xs">
          +{result.newMatches}
        </Badge>
        <Badge variant="secondary" className="text-2xs">
          -{result.removedMatches}
        </Badge>
        <Badge variant="secondary" className="text-2xs">
          {result.statusChanges} Δ
        </Badge>
      </div>
      {result.changed.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
            Will change ({result.changed.length})
          </div>
          {result.changed.map((d) => (
            <div key={d.description} className="text-xs rounded border-l-2 border-primary pl-2">
              <div className="font-medium truncate">{d.description}</div>
              <div className="text-2xs text-muted-foreground">
                {d.before} → {d.after}
              </div>
            </div>
          ))}
        </div>
      )}
      {result.unchangedCount > 0 && (
        <div className="text-2xs text-muted-foreground">
          Already matching ({result.unchangedCount})
        </div>
      )}
    </div>
  );
}

export function ImpactPanel({
  view,
  importResult,
  existing,
}: {
  view: 'selected' | 'combined';
  importResult: ImpactResultFixture;
  existing: ImpactResultFixture | (ImpactResultFixture & { dbTotal: number });
}) {
  const truncated = 'dbTotal' in existing;
  return (
    <div className="flex flex-col min-h-0 border-l">
      <div className="px-4 py-2 border-b flex items-center gap-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex-1">
          Impact
        </div>
        <Button size="sm" variant="ghost" title="Re-run preview" aria-label="Re-run preview">
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div className="px-4 py-2 border-b flex gap-1">
        <Button size="sm" variant={view === 'selected' ? 'default' : 'outline'} className="flex-1">
          Selected
        </Button>
        <Button size="sm" variant={view === 'combined' ? 'default' : 'outline'} className="flex-1">
          Combined
        </Button>
      </div>
      <div className="flex-1 overflow-auto px-4 py-3 space-y-4">
        <div>
          <div className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            Import transactions
          </div>
          <ImpactContent result={importResult} />
        </div>
        <div className="border-t pt-3">
          <div className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
            Existing transactions
            {truncated && (
              <span
                className="text-warning normal-case font-normal"
                title={`Preview truncated — showing first ${existing.total} of ${existing.dbTotal} existing transactions.`}
              >
                (preview truncated — first {existing.total} of {existing.dbTotal})
              </span>
            )}
          </div>
          <ImpactContent result={existing} />
        </div>
      </div>
    </div>
  );
}

export function AiHelperBar({ active }: { active: boolean }) {
  return (
    <div className="border-t bg-muted/20 px-6 py-3 space-y-2 max-h-48 flex flex-col">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <Sparkles className="h-3.5 w-3.5" />
        AI helper
      </div>
      {active && (
        <div className="flex-1 overflow-auto space-y-1.5 max-h-24">
          {aiHelperTranscript.map((m) => (
            <div
              key={m.id}
              className={`text-xs ${m.role === 'user' ? 'text-foreground' : 'text-muted-foreground italic'}`}
            >
              <span className="font-semibold mr-1">{m.role === 'user' ? 'You:' : 'AI:'}</span>
              {m.text}
            </div>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <Input
          placeholder="e.g. split location into its own rule, or exclude transfers"
          readOnly
          className="flex-1"
        />
        <Button disabled>Send</Button>
      </div>
    </div>
  );
}

export function RejectPanel() {
  return (
    <div className="border-t bg-muted/20 px-6 py-3 space-y-2">
      <Label>Reason for rejecting this proposal (required)</Label>
      <Textarea placeholder="Why doesn't this rule fit?" rows={2} readOnly />
    </div>
  );
}

export function CorrectionFooter({ rejecting }: { rejecting: boolean }) {
  return (
    <div className="flex items-center justify-between w-full">
      <Button variant="ghost">{rejecting ? 'Cancel reject' : 'Reject'}</Button>
      <div className="flex gap-2">
        <Button variant="outline">Cancel</Button>
        <Button disabled={rejecting}>Apply changes</Button>
      </div>
    </div>
  );
}

export function CorrectionHeader() {
  return (
    <div className="px-6 py-2 border-b bg-muted/20 flex items-center gap-2 text-xs text-muted-foreground">
      Overriding the match on
      <code className="rounded bg-background px-1.5 py-0.5 text-xs">SQ *THE GROUNDS OF ALEX</code>—
      this proposal edits the rule that produced the wrong match.
    </div>
  );
}
