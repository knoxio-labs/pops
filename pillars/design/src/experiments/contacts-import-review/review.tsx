import { contactImportRows } from '@/fixtures/contact-imports';
import { Check, Users } from 'lucide-react';
import { useState } from 'react';

import { Button, Card, CardContent, EmptyState, PageHeader } from '@pops/ui';

import { ReviewCompare, ReviewTable } from './review-layouts';
import { useReviewModel, type ReviewModel } from './review-model';

import type { ScreenStates } from '@/contract';

type Layout = 'table' | 'compare';
type Condition = 'ready' | 'loading' | 'error' | 'empty' | 'success';
const boundaryContent = {
  success: [
    'Import complete',
    'Resolved contacts were imported. Contacts marked Later remain in the review queue. Source records remain available.',
  ],
  loading: [
    'Checking identities',
    'Reading contacts and comparing exact email, phone and complete full names…',
  ],
  error: [
    'Could not prepare review',
    'Google disconnected before the preview finished. Nothing was imported. Reconnect and retry.',
  ],
  empty: [
    'No contacts to import',
    'This source contains no contact records. Choose another file or provider.',
  ],
};

function Boundary({ condition }: { condition: Exclude<Condition, 'ready'> }) {
  const [title, description] = boundaryContent[condition];
  return (
    <div className="mx-auto max-w-5xl p-6">
      <EmptyState title={title ?? ''} description={description} icon={Users} />
      <Button
        variant="outline"
        onClick={() => {
          window.location.href = '/design/s/contacts/import-preview';
        }}
      >
        Back to import
      </Button>
    </div>
  );
}

function ReviewPolicy({ model }: { model: ReviewModel }) {
  const held =
    Object.values(model.choices).filter((choice) => choice === 'Later').length +
    Object.values(model.candidates)
      .flatMap((decisions) => Object.values(decisions))
      .filter((choice) => choice === 'later').length;
  return (
    <>
      <Card>
        <CardContent className="space-y-2 pt-6">
          <p className="text-lg font-semibold">Exact matches are ready. You decide the rest.</p>
          <p className="max-w-3xl text-base leading-7 text-foreground/90">
            Email, phone or one unambiguous complete name can match automatically. First names alone
            never trigger an automatic merge. Select only the contacts that belong together.
          </p>
        </CardContent>
      </Card>
      <p className="text-base leading-7 text-foreground/85">
        {held} reviews saved for later. Existing details stay unless you choose a replacement.
      </p>
    </>
  );
}

/** Two review arrangements share evidence and local, reversible decision controls. */
export function ContactReview({
  layout,
  condition = 'ready',
  initialSubset = false,
}: {
  layout: Layout;
  condition?: Condition;
  initialSubset?: boolean;
}) {
  const model = useReviewModel(initialSubset);
  const [committed, setCommitted] = useState(false);
  const pending = contactImportRows.reduce((count, row) => {
    if (row.outcome !== 'Review required' || model.choices[row.id] === 'Later') return count;
    const decisions = model.candidates[row.id] ?? {};
    const unanswered = row.candidates.filter((candidate) => !decisions[candidate.id]).length;
    const needsConfirmation =
      !model.choices[row.id] &&
      row.candidates.some(
        (candidate) =>
          decisions[candidate.id] === 'merge' || decisions[candidate.id] === 'different'
      );
    return count + unanswered + Number(needsConfirmation);
  }, 0);
  if (committed) return <Boundary condition="success" />;
  if (condition !== 'ready') return <Boundary condition={condition} />;
  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <PageHeader
        title="Review contact import"
        description={`6 incoming contacts · 3 automatic merges · ${pending} decisions pending · 1 new person`}
        actions={
          <Button disabled={pending > 0} onClick={() => setCommitted(true)}>
            <Check className="size-4" />
            Import resolved contacts
          </Button>
        }
      />
      <ReviewPolicy model={model} />
      {layout === 'table' ? <ReviewTable model={model} /> : <ReviewCompare model={model} />}
    </div>
  );
}

/** Named boundary states shared across both alternatives. */
export function reviewStates(layout: Layout): ScreenStates {
  return {
    loading: () => <ContactReview layout={layout} condition="loading" />,
    error: () => <ContactReview layout={layout} condition="error" />,
    empty: () => <ContactReview layout={layout} condition="empty" />,
    success: () => <ContactReview layout={layout} condition="success" />,
    'subset-selected': () => <ContactReview layout={layout} initialSubset />,
  };
}
