import { tripOverviewProposals } from '@/fixtures/trip-overview';
import { ArrowRight, Compass } from 'lucide-react';

import { Badge, Button, Card, CardContent } from '@pops/ui';

import type { ScreenMeta } from '@/contract';

/** Proposal index; it does not select a winning overview. */
export const meta: ScreenMeta = { title: 'Trip overview proposals', order: 1, frame: 'web' };

/** Entry point for comparing the three unapproved overview structures. */
export default function TripOverviewProposals() {
  return (
    <main className="mx-auto max-w-6xl space-y-8 p-6 md:p-10">
      <div className="space-y-4">
        <Compass className="size-8 text-app-accent" aria-hidden />
        <Badge variant="outline">T02 · Awaiting your review</Badge>
        <h1 className="text-3xl font-semibold tracking-tight">Where should planning begin?</h1>
        <p className="max-w-2xl text-lg text-muted-foreground">
          The same open-ended trip. Three different ways to make sense of it.
        </p>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Compare the route, decisions and places proposals. All use fictional bookings, people and
          event dates. Capture a thought, open an item and try changing its intention. No proposal
          has been chosen.
        </p>
      </div>
      <div className="grid gap-5 lg:grid-cols-3">
        {tripOverviewProposals.map((proposal) => (
          <Card key={proposal.id}>
            <CardContent className="flex h-full flex-col gap-5">
              <h2 className="text-xl font-semibold">{proposal.title}</h2>
              <p className="font-medium">{proposal.lead}</p>
              <p className="text-sm text-muted-foreground">{proposal.description}</p>
              <p className="text-sm text-muted-foreground">Trade-off: {proposal.tradeoff}</p>
              <p className="text-sm">{proposal.question}</p>
              <Button className="mt-auto" asChild>
                <a
                  target="_top"
                  href={`/design/x/trip-overview-shape/${proposal.id}/s/trips/overview`}
                >
                  Explore proposal
                  <ArrowRight className="size-4" aria-hidden />
                </a>
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
      <section className="space-y-3 rounded-xl border bg-muted/30 p-5">
        <h2 className="font-semibold">What to decide after exploring</h2>
        <ol className="list-decimal space-y-2 pl-5 text-sm">
          <li>Which structure best matches how you think about the trip?</li>
          <li>Which parts should we combine or change before the next review?</li>
          <li>Are intention, booking status and alternatives clear enough?</li>
        </ol>
        <p className="text-sm text-muted-foreground">
          This is one prototype in the tracker. Your choice and explicit approval come after
          revisions; implementation waits for the full prototype set.
        </p>
      </section>
    </main>
  );
}
