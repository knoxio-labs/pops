import { AlertCircle, Copy, Terminal, TriangleAlert } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle, Button } from '@pops/ui';

import type { ExpressionIssue } from './scenario';

/** Name of the MCP tool that publishes a draft together with its migration. */
export const MCP_PUBLISH_TOOL = 'inventory.catalogue.publishDraft';

/**
 * Standing notice that computed changes to a published type publish through
 * MCP. Every such change classifies as migration required, and the web editor
 * never publishes migrations, so the author learns the route before saving.
 */
export function McpPublishRoute({ draftRevision }: { draftRevision: number }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border bg-muted/40 px-3 py-2 text-xs">
      <Terminal className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <p>
        <span className="font-medium">Publishes through MCP, not here.</span>{' '}
        <span className="text-muted-foreground">
          Computed changes to a published type need a named migration. Save the draft, then publish
          revision {draftRevision} with <code className="font-mono">{MCP_PUBLISH_TOOL}</code>.
        </span>
      </p>
    </div>
  );
}

/** The publish refusal when the draft classifies as migration required. */
export function MigrationRequiredRefusal({
  draftRevision,
  changes,
}: {
  draftRevision: number;
  changes: readonly { field: string; change: string; items: number }[];
}) {
  return (
    <Alert variant="destructive">
      <TriangleAlert />
      <AlertTitle>Migration required: publish through MCP</AlertTitle>
      <AlertDescription>
        <ul className="my-1 space-y-0.5">
          {changes.map((entry) => (
            <li key={entry.field}>
              <span className="font-medium">{entry.field}</span>: {entry.change} · {entry.items}{' '}
              items
            </li>
          ))}
        </ul>
        <p>
          This editor does not publish migrations. Publish draft revision {draftRevision} with a
          named migration using <code className="font-mono">{MCP_PUBLISH_TOOL}</code>. The draft
          stays here until then.
        </p>
      </AlertDescription>
      <div className="col-start-2 mt-2">
        <Button variant="outline" size="sm">
          <Copy className="h-4 w-4" />
          Copy draft reference
        </Button>
      </div>
    </Alert>
  );
}

/** Save refusal summary; each issue is also flagged on its node in the outline. */
export function SaveRefused({ issues }: { issues: readonly ExpressionIssue[] }) {
  return (
    <Alert variant="destructive">
      <AlertCircle />
      <AlertTitle>Not saved to the draft</AlertTitle>
      <AlertDescription>
        {issues.length === 1
          ? `${issues[0]?.title ?? 'One problem'}. The flagged node shows what to change.`
          : `${issues.length} problems. Each flagged node shows what to change.`}{' '}
        Your edits are still here.
      </AlertDescription>
    </Alert>
  );
}
