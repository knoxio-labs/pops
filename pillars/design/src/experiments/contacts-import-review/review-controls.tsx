import { Clock } from 'lucide-react';

import { Badge, Button } from '@pops/ui';

import type { ContactImportRow } from '@/fixtures/contact-imports';

/** Local review choice; Later leaves the source record unimported. */
export type Choice = 'Merge' | 'Keep separate' | 'Later';
/** Shared state keeps the two review layouts on identical decisions. */
export interface ReviewModel {
  selected: string;
  candidate: string;
  choices: Partial<Record<string, Choice>>;
  select: (id: string) => void;
  selectCandidate: (id: string, name: string) => void;
  choose: (id: string, choice: Choice) => void;
}
/** Source and identity evidence, identical in both layouts. */
export function Evidence({ row }: { row: ContactImportRow }) {
  return (
    <div className="space-y-2">
      <Badge variant="outline">{row.outcome}</Badge>
      <p className="text-sm">{row.evidence}</p>
      <p className="text-xs text-muted-foreground">
        {row.source} · {row.email || row.phone || 'No contact details'}
      </p>
    </div>
  );
}
/** Candidate selection is explicit when more than one person shares a name. */
export function Candidates({ row, model }: { row: ContactImportRow; model: ReviewModel }) {
  return (
    <div className="flex flex-col gap-2">
      {row.candidates.length === 0 && (
        <p>Create a new person. First names alone never merge automatically.</p>
      )}
      {row.candidates.map((name) => (
        <Button
          key={name}
          variant={model.candidate === name ? 'secondary' : 'outline'}
          className="h-auto min-h-11 w-full justify-start whitespace-normal break-all py-3 text-left"
          onClick={() => model.selectCandidate(row.id, name)}
        >
          {name}
        </Button>
      ))}
    </div>
  );
}
/** Merging ambiguous candidates requires an explicit selected person. */
export function Decision({ row, model }: { row: ContactImportRow; model: ReviewModel }) {
  if (row.outcome !== 'Review required') return <Badge variant="secondary">{row.outcome}</Badge>;
  const canMerge =
    row.candidates.length === 1 || (model.selected === row.id && model.candidate !== '');
  const choice = model.choices[row.id];
  return (
    <div className="space-y-2">
      {choice && <p className="text-sm">Decision: {choice}</p>}
      <div className="flex flex-wrap gap-2">
        <Button
          variant={choice === 'Merge' ? 'default' : 'outline'}
          disabled={!canMerge}
          onClick={() => model.choose(row.id, 'Merge')}
        >
          Merge
        </Button>
        <Button
          variant={choice === 'Keep separate' ? 'default' : 'outline'}
          onClick={() => model.choose(row.id, 'Keep separate')}
        >
          Keep separate
        </Button>
        <Button
          variant={choice === 'Later' ? 'secondary' : 'ghost'}
          onClick={() => model.choose(row.id, 'Later')}
        >
          <Clock className="size-4" />
          Later
        </Button>
      </div>
    </div>
  );
}
