import { AlertCircle, Terminal } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@pops/ui';

import type { ExpressionIssue } from './issues';

/** Name of the MCP tool that publishes a draft together with its migration. */
export const MCP_PUBLISH_TOOL = 'inventory.catalogue.publishDraft';

/**
 * Notice that this field's change classifies as migration required, which the
 * web editor never publishes, so the author learns the route before saving.
 */
export function McpPublishRoute({ draftRevision }: { draftRevision: number | null }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border bg-muted/40 px-3 py-2 text-xs">
      <Terminal className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <p>
        <span className="font-medium">Publishes through MCP, not here.</span>{' '}
        <span className="text-muted-foreground">
          This change to a published type needs a named migration. Save the draft, then publish
          {draftRevision === null ? ' it' : ` revision ${draftRevision}`} with{' '}
          <code className="font-mono">{MCP_PUBLISH_TOOL}</code>.
        </span>
      </p>
    </div>
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
