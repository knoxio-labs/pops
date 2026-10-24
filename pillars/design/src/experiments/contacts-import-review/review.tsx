import { contactImportRows } from '@/fixtures/contact-imports';
import { Check, Users } from 'lucide-react';
import { useState } from 'react';

import { Button, Card, CardContent, EmptyState, PageHeader } from '@pops/ui';

import { type Choice, type ReviewModel } from './review-controls';
import { ReviewCompare, ReviewTable } from './review-layouts';

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

function useReviewModel(): ReviewModel {
  const [selected, setSelected] = useState('ambiguous');
  const [candidate, setCandidate] = useState('');
  const [choices, setChoices] = useState<Partial<Record<string, Choice>>>({
    separate: 'Keep separate',
  });
  return {
    selected,
    candidate,
    choices,
    select: (id) => {
      setSelected(id);
      setCandidate('');
    },
    selectCandidate: (id, name) => {
      setSelected(id);
      setCandidate(name);
    },
    choose: (id, choice) => setChoices((previous) => ({ ...previous, [id]: choice })),
  };
}

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
  const held = Object.values(model.choices).filter((choice) => choice === 'Later').length;
  return (
    <>
      <Card>
        <CardContent className="space-y-2 pt-6">
          <p className="font-medium">Only exact evidence can merge automatically</p>
          <p className="text-sm text-muted-foreground">
            Exact email or phone, or one unambiguous complete full name. A first name alone never
            merges automatically. Conflicting or multiple candidates require your review. Later
            holds that contact out of this import.
          </p>
        </CardContent>
      </Card>
      <p className="text-sm text-muted-foreground">
        {held} held for later · Existing POPS details stay unless you choose a replacement.
      </p>
    </>
  );
}

/** Two review arrangements share evidence and local, reversible decision controls. */
export function ContactReview({
  layout,
  condition = 'ready',
}: {
  layout: Layout;
  condition?: Condition;
}) {
  const model = useReviewModel();
  const [committed, setCommitted] = useState(false);
  const pending = contactImportRows.filter(
    (row) => row.outcome === 'Review required' && !model.choices[row.id]
  ).length;
  if (committed) return <Boundary condition="success" />;
  if (condition !== 'ready') return <Boundary condition={condition} />;
  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <PageHeader
        title="Review contact import"
        description={`6 incoming contacts · 3 automatic merges · ${pending} unresolved · 1 new person`}
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
  };
}
