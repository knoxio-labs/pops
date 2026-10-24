import { Badge, Button, CheckboxInput } from '@pops/ui';

import type { ContactCandidate, ContactImportRow } from '@/fixtures/contact-imports';

import type { ReviewModel } from './review-model';

const choiceLabels = {
  merge: 'Selected for merge',
  different: 'Excluded · decision remembered',
  later: 'Pending · review later',
};

function Candidate({
  candidate,
  row,
  model,
}: {
  candidate: ContactCandidate;
  row: ContactImportRow;
  model: ReviewModel;
}) {
  const choice = model.candidates[row.id]?.[candidate.id];
  return (
    <div
      className={`space-y-3 rounded-lg border p-4 ${choice === 'merge' ? 'border-app-accent bg-accent' : 'border-border bg-background'}`}
    >
      <div className="flex items-start justify-between gap-3">
        <CheckboxInput
          checked={choice === 'merge'}
          onCheckedChange={() => model.decideCandidate(row.id, candidate.id, 'merge')}
          label={<span className="text-base font-semibold leading-6">{candidate.name}</span>}
          aria-label={`Include ${candidate.detail} in merge`}
        />
        <span className="text-sm text-foreground/80">{candidate.source}</span>
      </div>
      <p className="break-words text-base leading-6 text-foreground/90">{candidate.detail}</p>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant={choice === 'different' ? 'secondary' : 'outline'}
          aria-pressed={choice === 'different'}
          onClick={() => model.decideCandidate(row.id, candidate.id, 'different')}
        >
          Different person
        </Button>
        <Button
          variant={choice === 'later' ? 'secondary' : 'ghost'}
          aria-pressed={choice === 'later'}
          onClick={() => model.decideCandidate(row.id, candidate.id, 'later')}
        >
          Review later
        </Button>
      </div>
      {choice && <Badge variant="outline">{choiceLabels[choice]}</Badge>}
    </div>
  );
}

/** Each candidate can be selected, excluded or deferred independently. */
export function Candidates({ row, model }: { row: ContactImportRow; model: ReviewModel }) {
  if (row.candidates.length === 0)
    return (
      <p className="text-base leading-6">
        Create a new person. First names alone never merge automatically.
      </p>
    );
  return (
    <div className="space-y-3">
      {row.candidates.map((candidate) =>
        row.outcome === 'Review required' ? (
          <Candidate key={candidate.id} candidate={candidate} row={row} model={model} />
        ) : (
          <div
            key={candidate.id}
            className="space-y-1 rounded-lg border border-border bg-background p-4"
          >
            <p className="text-base font-semibold">{candidate.name}</p>
            <p className="break-words text-base text-foreground/90">{candidate.detail}</p>
          </div>
        )
      )}
    </div>
  );
}
