import { Clock } from 'lucide-react';

import { Badge, Button } from '@pops/ui';

import type { ContactImportRow } from '@/fixtures/contact-imports';

import type { ReviewModel } from './review-model';

/** Source evidence uses readable text without repeated status labels. */
export function Evidence({ row }: { row: ContactImportRow }) {
  return (
    <div className="space-y-2">
      <p className="text-base font-medium leading-6">{row.evidence}</p>
      <p className="break-words text-base leading-6 text-foreground/85">
        {row.email || row.phone || 'No contact details'}
      </p>
      <p className="text-sm text-foreground/80">From {row.source}</p>
    </div>
  );
}

/** Only selected contacts merge; other candidates retain their own decisions. */
export function Decision({ row, model }: { row: ContactImportRow; model: ReviewModel }) {
  if (row.outcome !== 'Review required')
    return (
      <Badge variant="secondary" className="text-sm">
        {row.outcome}
      </Badge>
    );
  const decisions = model.candidates[row.id] ?? {};
  const selected = row.candidates.filter((candidate) => decisions[candidate.id] === 'merge').length;
  const excluded = row.candidates.filter(
    (candidate) => decisions[candidate.id] === 'different'
  ).length;
  const later = row.candidates.filter((candidate) => decisions[candidate.id] === 'later').length;
  const pending = row.candidates.length - selected - excluded - later;
  const choice = model.choices[row.id];
  return (
    <div className="space-y-3">
      <p className="text-base font-medium">
        {selected > 0 ? `${selected + 1} contacts selected` : 'Select contacts to merge'}
      </p>
      <p className="text-sm leading-6 text-foreground/85">
        {excluded} excluded · {later + pending} pending
      </p>
      {choice && (
        <p role="status" className="text-base font-semibold">
          {choice === 'Merge selected' ? `Merge only ${selected + 1} selected contacts` : choice}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button disabled={selected === 0} onClick={() => model.choose(row.id, 'Merge selected')}>
          Merge selected{selected > 0 ? ` (${selected + 1})` : ''}
        </Button>
        {excluded === row.candidates.length && (
          <Button variant="outline" onClick={() => model.choose(row.id, 'Keep separate')}>
            Save exclusions
          </Button>
        )}
        <Button variant="ghost" onClick={() => model.choose(row.id, 'Later')}>
          <Clock className="size-4" />
          Review this contact later
        </Button>
      </div>
      <p className="text-sm leading-6 text-foreground/85">
        Unselected contacts stay separate. Exclusions and later reviews do not affect the selected
        merge.
      </p>
    </div>
  );
}
