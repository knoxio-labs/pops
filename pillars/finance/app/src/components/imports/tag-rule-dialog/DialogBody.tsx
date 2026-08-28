import { Checkbox, Input, Label, Textarea } from '@pops/ui';

import { describeTag } from '../../../lib/tags';

import type { ProposeOutput, TagRuleLearnSignal } from './types';

interface FormFieldsProps {
  pattern: string;
  matchType: 'exact' | 'contains' | 'regex';
  tagsText: string;
  setPattern: (v: string) => void;
  setMatchType: (v: 'exact' | 'contains' | 'regex') => void;
  setTagsText: (v: string) => void;
}

export function FormFields(props: FormFieldsProps) {
  return (
    <>
      <div className="space-y-2">
        <Label htmlFor="tr-pattern">Description pattern</Label>
        <Input
          id="tr-pattern"
          value={props.pattern}
          onChange={(e) => props.setPattern(e.target.value)}
          placeholder="e.g. WOOLWORTHS"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="tr-match">Match type</Label>
        <select
          id="tr-match"
          className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
          value={props.matchType}
          onChange={(e) => props.setMatchType(e.target.value as 'exact' | 'contains' | 'regex')}
        >
          <option value="contains">Contains</option>
          <option value="exact">Exact</option>
          <option value="regex">Regex</option>
        </select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="tr-tags">Tags (comma-separated)</Label>
        <Input
          id="tr-tags"
          value={props.tagsText}
          onChange={(e) => props.setTagsText(e.target.value)}
          placeholder="Groceries, Transport"
        />
      </div>
    </>
  );
}

const LISTED_ROWS = 12;

function ImpactSummary({ counts }: { counts: ProposeOutput['preview']['counts'] }) {
  const rows = `${counts.affected} row${counts.affected === 1 ? '' : 's'}`;
  const changes = `${counts.suggestionChanges} tag change${counts.suggestionChanges === 1 ? '' : 's'}`;
  return (
    <p className="text-xs text-muted-foreground" data-testid="impact-summary">
      {rows} in this import would see different tag suggestions ({changes}
      {counts.removed > 0 ? `, ${counts.removed} removed` : ''}). Rows you have tagged by hand are
      left alone.
    </p>
  );
}

export function ImpactPreview({ proposal }: { proposal: ProposeOutput }) {
  const { counts, affected } = proposal.preview;
  const listed = affected.slice(0, LISTED_ROWS);
  const unlisted = counts.affected - listed.length;
  return (
    <>
      <p className="text-muted-foreground text-xs">{proposal.rationale}</p>
      <div className="rounded-md border p-3 space-y-1">
        <p className="font-medium text-xs">Impact preview</p>
        <ImpactSummary counts={counts} />
        <ul className="text-xs max-h-28 overflow-y-auto space-y-0.5 font-mono">
          {listed.map((a) => (
            <li key={a.transactionId} className="truncate" title={a.description}>
              {a.description.slice(0, 56)}
              {a.description.length > 56 ? '\u2026' : ''}
            </li>
          ))}
        </ul>
        {unlisted > 0 && (
          <p className="text-xs text-muted-foreground" data-testid="impact-unlisted">
            +{unlisted} more not listed
          </p>
        )}
      </div>
    </>
  );
}

export function NewTagsPanel({
  newTagNames,
  acceptedNewTags,
  setAcceptedNewTags,
}: {
  newTagNames: string[];
  acceptedNewTags: Set<string>;
  setAcceptedNewTags: React.Dispatch<React.SetStateAction<Set<string>>>;
}) {
  if (newTagNames.length === 0) return null;
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium">New vocabulary tags — accept before saving</p>
      <div className="space-y-2">
        {newTagNames.map((tag) => (
          <label
            key={tag}
            className="flex items-center gap-2 text-xs"
            title={describeTag(tag).title}
          >
            <Checkbox
              checked={acceptedNewTags.has(tag)}
              onCheckedChange={(v) =>
                setAcceptedNewTags((prev) => {
                  const next = new Set(prev);
                  if (v === true) next.add(tag);
                  else next.delete(tag);
                  return next;
                })
              }
            />
            <span>{describeTag(tag).ariaLabel}</span>
            <span className="text-muted-foreground">(new)</span>
          </label>
        ))}
      </div>
    </div>
  );
}

export function RejectPanel({
  open,
  rejectFeedback,
  setRejectFeedback,
}: {
  open: boolean;
  rejectFeedback: string;
  setRejectFeedback: (v: string) => void;
}) {
  if (!open) return null;
  return (
    <div className="space-y-2">
      <Label htmlFor="tr-reject">Feedback (required)</Label>
      <Textarea
        id="tr-reject"
        value={rejectFeedback}
        onChange={(e) => setRejectFeedback(e.target.value)}
        rows={3}
        placeholder="What should change about this rule?"
      />
    </div>
  );
}

export type { TagRuleLearnSignal };
