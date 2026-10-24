import { tripOverviewProposals } from '@/fixtures/trip-overview';
import { ArrowLeft, ArrowRight } from 'lucide-react';

import { Badge, Button } from '@pops/ui';

import type { TripOverviewLayout } from '@/fixtures/trip-overview';

/** Review navigation remains separate from the proposed product interface. */
export function OverviewReviewNotes({ layout }: { layout: TripOverviewLayout }) {
  return (
    <div className="border-b bg-muted/40 px-5 py-4">
      <div className="mx-auto max-w-7xl space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Badge variant="outline">T02 · Approved: route-first</Badge>
            <span className="text-xs text-muted-foreground">
              Fictional data · changes reset on reload
            </span>
          </div>
          <Button asChild variant="ghost" size="sm">
            <a target="_top" href="/design/s/trips/overview">
              <ArrowLeft className="size-4" aria-hidden />
              All proposals
            </a>
          </Button>
        </div>
        <nav className="flex flex-wrap gap-2" aria-label="Overview proposals">
          {tripOverviewProposals.map((item) => (
            <Button key={item.id} asChild variant={layout === item.id ? 'default' : 'outline'}>
              <a
                target="_top"
                aria-current={layout === item.id ? 'page' : undefined}
                href={`/design/x/trip-overview-shape/${item.id}/s/trips/overview`}
              >
                {item.title}
              </a>
            </Button>
          ))}
        </nav>
        <ProposalQuestions layout={layout} />
      </div>
    </div>
  );
}

function ProposalQuestions({ layout }: { layout: TripOverviewLayout }) {
  const proposal = tripOverviewProposals.find((item) => item.id === layout);
  return (
    <details className="rounded-lg border bg-background px-4">
      <summary className="min-h-11 cursor-pointer py-3 text-sm font-medium">
        Proposal, trade-offs and questions
      </summary>
      <div className="space-y-3 pb-4 text-sm">
        <p>{proposal?.description}</p>
        <p className="text-muted-foreground">Trade-off: {proposal?.tradeoff}</p>
        <ol className="list-decimal space-y-2 pl-5">
          <li>{proposal?.question}</li>
          <li>Do solid purchased arrangements stand apart from every planned or wanted item?</li>
          <li>Does the birthday anchor Curitiba without setting arrival or departure dates?</li>
          <li>Does the January segment show competing paths rather than consecutive stops?</li>
        </ol>
        <p className="text-muted-foreground">
          Try selecting an item, adding a possibility to the working plan, and capturing an undated
          note. Empty, anchor-only and event-discovered states are available in the playground.
          Route-first approved on 24 October 2026. Other variants are retained for comparison.
        </p>
        <Button asChild variant="link">
          <a
            href="https://projects.knoxiolabs.com/workbench/knoxiolabs/document/trips-and-contacts-prototype-approval-tracker-6adc0e59c7cd51445fd68746"
            target="_blank"
            rel="noreferrer"
          >
            Prototype approval tracker
            <ArrowRight className="size-4" aria-hidden />
          </a>
        </Button>
      </div>
    </details>
  );
}
