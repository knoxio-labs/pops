/**
 * Side panel rendered inside `TagRuleEditDialog` showing the rule's usage
 * telemetry (times applied / last used) plus a full-DB preview of the
 * transactions its `(pattern, matchType)` currently matches.
 */
import { Loader2 } from 'lucide-react';

import { formatDate } from '@pops/ui';

import type { TagRule } from '../types';
import type { TagRuleUsagePreviewMatch } from './useTagRuleUsagePreview';

export interface TagRuleUsagePreviewPanelProps {
  rule: TagRule;
  preview: {
    matches: TagRuleUsagePreviewMatch[];
    totalCount: number;
    isFetching: boolean;
    error: { message: string } | null;
  };
}

function UsageStats({ rule }: { rule: TagRule }) {
  return (
    <dl className="grid grid-cols-2 gap-2 text-sm">
      <div>
        <dt className="text-xs text-muted-foreground">Times applied</dt>
        <dd className="tabular-nums font-medium">{rule.timesApplied}</dd>
      </div>
      <div>
        <dt className="text-xs text-muted-foreground">Last used</dt>
        <dd className="font-medium">{rule.lastUsedAt ? formatDate(rule.lastUsedAt) : 'Never'}</dd>
      </div>
    </dl>
  );
}

function MatchRow({ match }: { match: TagRuleUsagePreviewMatch }) {
  return (
    <li className="p-2 text-sm" data-testid="usage-preview-match-row">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono">{match.description}</span>
        <span className="text-muted-foreground tabular-nums">{formatDate(match.date)}</span>
      </div>
      {match.entityName && (
        <div className="text-xs text-muted-foreground mt-1">{match.entityName}</div>
      )}
    </li>
  );
}

function MatchList({ preview }: TagRuleUsagePreviewPanelProps) {
  const { matches, isFetching, error } = preview;

  if (error) return <p className="text-sm text-destructive">{error.message}</p>;
  if (isFetching && matches.length === 0) {
    return (
      <p className="text-sm text-muted-foreground inline-flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading match history…
      </p>
    );
  }
  if (matches.length === 0) {
    return (
      <p className="text-sm text-muted-foreground" data-testid="usage-preview-no-matches">
        No transactions currently match this rule.
      </p>
    );
  }
  return (
    <ul className="divide-y divide-border rounded-md border" data-testid="usage-preview-matches">
      {matches.map((match) => (
        <MatchRow key={match.id} match={match} />
      ))}
    </ul>
  );
}

export function TagRuleUsagePreviewPanel({ rule, preview }: TagRuleUsagePreviewPanelProps) {
  return (
    <div className="flex flex-col gap-3 min-w-0" data-testid="tag-rule-usage-preview-panel">
      <UsageStats rule={rule} />
      <div>
        <h3 className="text-sm font-semibold">Match history</h3>
        <p className="text-xs text-muted-foreground" data-testid="usage-preview-count">
          {preview.totalCount} matching transaction{preview.totalCount === 1 ? '' : 's'} in the
          database
        </p>
      </div>
      <MatchList rule={rule} preview={preview} />
    </div>
  );
}
