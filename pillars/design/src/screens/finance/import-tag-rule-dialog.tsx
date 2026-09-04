import {
  Badge,
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Textarea,
} from '@pops/ui';

import type { ScreenMeta, ScreenStates } from '@/contract';

export const meta: ScreenMeta = { title: 'Import — save tag rule', order: 4, frame: 'web' };

type MatchType = 'exact' | 'contains' | 'regex';
type AffectedRow = { id: string; description: string };
type NewTag = { name: string; accepted: boolean };
type DialogProps = {
  pattern: string;
  matchType: MatchType;
  tagsText: string;
  affected: AffectedRow[];
  rationale: string;
  newTags: NewTag[];
  rejecting: boolean;
};

const rows = (count: number): AffectedRow[] =>
  Array.from({ length: count }, (_, i) => ({
    id: `t${i + 1}`,
    description: `WOOLWORTHS STORE ${1000 + i} SYDNEY AU`,
  }));
const FEW_ROWS = rows(3);
const MANY_ROWS = rows(12);
const LISTED_ROWS = 12;

function FormFields(props: DialogProps) {
  return (
    <>
      <div className="space-y-2">
        <Label htmlFor="tr-pattern">Description pattern</Label>
        <Input id="tr-pattern" value={props.pattern} readOnly placeholder="e.g. WOOLWORTHS" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="tr-match">Match type</Label>
        <select
          id="tr-match"
          className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
          value={props.matchType}
          disabled
        >
          <option value="contains">Contains</option>
          <option value="exact">Exact</option>
          <option value="regex">Regex</option>
        </select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="tr-tags">Tags (comma-separated)</Label>
        <Input id="tr-tags" value={props.tagsText} readOnly placeholder="Groceries, Transport" />
      </div>
    </>
  );
}

function ImpactPreview(props: DialogProps) {
  const listed = props.affected.slice(0, LISTED_ROWS);
  const unlisted = props.affected.length - listed.length;
  const summary =
    props.affected.length === 0
      ? '0 rows in this import would see different tag suggestions.'
      : `${props.affected.length} row${props.affected.length === 1 ? '' : 's'} in this import would see different tag suggestions.`;
  return (
    <>
      <p className="text-muted-foreground text-xs">{props.rationale}</p>
      <div className="rounded-md border p-3 space-y-1">
        <p className="font-medium text-xs">Impact preview</p>
        <p className="text-xs text-muted-foreground">{summary}</p>
        {listed.length > 0 && (
          <ul className="text-xs max-h-28 overflow-y-auto space-y-0.5 font-mono">
            {listed.map((row) => (
              <li key={row.id} className="truncate" title={row.description}>
                {row.description}
              </li>
            ))}
          </ul>
        )}
        {unlisted > 0 && (
          <p className="text-xs text-muted-foreground">+{unlisted} more not listed</p>
        )}
      </div>
    </>
  );
}

function NewTagsPanel({ newTags }: DialogProps) {
  if (newTags.length === 0) return null;
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium">New vocabulary tags — accept before saving</p>
      {newTags.map((tag) => (
        <label key={tag.name} className="flex items-center gap-2 text-xs">
          <Checkbox checked={tag.accepted} />
          <span>{tag.name}</span>
          <Badge variant="secondary" className="text-[10px]">
            new
          </Badge>
        </label>
      ))}
    </div>
  );
}

function DialogActions({ affected, rejecting }: DialogProps) {
  return (
    <DialogFooter>
      <Button type="button" variant="outline">
        Cancel
      </Button>
      {rejecting ? (
        <Button type="button" variant="ghost" className="text-destructive hover:text-destructive">
          Confirm reject
        </Button>
      ) : (
        <Button type="button" variant="secondary" disabled={affected.length === 0}>
          Reject…
        </Button>
      )}
      <Button type="button" disabled={affected.length === 0}>
        Save rule
      </Button>
    </DialogFooter>
  );
}

function RejectPanel({ rejecting }: DialogProps) {
  if (!rejecting) return null;
  return (
    <div className="space-y-2">
      <Label htmlFor="tr-reject">Feedback (required)</Label>
      <Textarea id="tr-reject" value="" readOnly rows={3} placeholder="What should change?" />
    </div>
  );
}

function Screen(props: DialogProps) {
  return (
    <Dialog defaultOpen>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Save tag rule</DialogTitle>
          <DialogDescription>
            Create a reusable tag rule from this group. Rules apply as <strong>suggestions</strong>{' '}
            on future imports and never overwrite tags you set manually.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 text-sm">
          <FormFields {...props} />
          <ImpactPreview {...props} />
          <NewTagsPanel {...props} />
          <RejectPanel {...props} />
        </div>
        <DialogActions {...props} />
      </DialogContent>
    </Dialog>
  );
}

const DEFAULT_PROPS: DialogProps = {
  pattern: 'WOOLWORTHS',
  matchType: 'contains',
  tagsText: 'groceries',
  affected: FEW_ROWS,
  rationale: 'Matches the description on every transaction in this group.',
  newTags: [],
  rejecting: false,
};

export default function ImportTagRuleDialog() {
  return <Screen {...DEFAULT_PROPS} />;
}

const STATE_OVERRIDES: Record<string, Partial<DialogProps>> = {
  'new-tags-pending': {
    tagsText: 'groceries, fresh-produce',
    newTags: [
      { name: 'fresh-produce', accepted: false },
      { name: 'weekly-shop', accepted: false },
    ],
  },
  'many-affected': {
    affected: MANY_ROWS,
    rationale:
      'Matches the description on every transaction across this import, not just this group.',
  },
  'no-impact': {
    pattern: 'WOOLWORTHS EXPRESS 99123',
    matchType: 'exact',
    affected: [],
    rationale: 'An exact match on this pattern has nothing else in this import to apply to yet.',
  },
  rejecting: { rejecting: true },
};

export const states: ScreenStates = Object.fromEntries(
  Object.entries(STATE_OVERRIDES).map(([name, overrides]) => [
    name,
    () => <Screen {...DEFAULT_PROPS} {...overrides} />,
  ])
);
