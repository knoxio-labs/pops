import { tripMetadata, tripDisplayName, tripDateLabel } from '@/fixtures/trip-metadata';
import { tripOverviewItems } from '@/fixtures/trip-overview';
import { filterTripItems, isPurchasedArrangement } from '@/fixtures/trip-overview-model';
import { ArrowDown, Compass, Inbox, Plus } from 'lucide-react';
import { useState } from 'react';

import { Badge, Button, TextInput } from '@pops/ui';

import { OverviewCaptureSheet, OverviewItemSheet } from './interaction-sheets';
import { OverviewLayout } from './layouts';
import { OverviewReviewNotes } from './review-notes';

import type { TripOverviewItem, TripOverviewLayout } from '@/fixtures/trip-overview';

/** Initial conditions use the same dataset across all three proposals. */
export type OverviewScenario = 'default' | 'empty' | 'anchors-only' | 'event-discovered';

function scenarioItems(scenario: OverviewScenario) {
  if (scenario === 'empty') return [];
  if (scenario === 'anchors-only')
    return tripOverviewItems.filter(
      (item) =>
        isPurchasedArrangement(item) ||
        tripOverviewItems.some(
          (child) => isPurchasedArrangement(child) && child.visitId === item.id
        )
    );
  return tripOverviewItems;
}

function OverviewHeading({ onCapture }: { onCapture: () => void }) {
  return (
    <header className="space-y-5">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Compass className="size-4" aria-hidden />
        Trips<span>/</span>
        <span>{tripDisplayName(tripMetadata)}</span>
      </div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              {tripDisplayName(tripMetadata)}
            </h1>
            <Badge variant="outline">{tripMetadata.stage}</Badge>
          </div>
          <p className="text-muted-foreground">{tripDateLabel(tripMetadata)}</p>
        </div>
        <Button onClick={onCapture}>
          <Plus className="size-4" aria-hidden />
          Add
        </Button>
      </div>
    </header>
  );
}

function OverviewInbox({ notes }: { notes: { id: string; title: string }[] }) {
  return (
    <section id="overview-inbox" className="space-y-3 rounded-xl border border-dashed p-5">
      <div className="flex items-center gap-2">
        <Inbox className="size-5 text-muted-foreground" aria-hidden />
        <h2 className="font-semibold">Inbox</h2>
        <Badge variant="secondary">{notes.length}</Badge>
      </div>
      {notes.length ? (
        <ul className="space-y-2">
          {notes.map((note) => (
            <li key={note.id} className="rounded-lg bg-muted p-3 text-sm">
              {note.title}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No unsorted items.</p>
      )}
    </section>
  );
}

/** Stateful, network-free trip overview proposal; all edits reset on remount. */
export function TripOverviewPrototype({
  layout,
  scenario = 'default',
}: {
  layout: TripOverviewLayout;
  scenario?: OverviewScenario;
}) {
  const [items, setItems] = useState(() => scenarioItems(scenario));
  const [selectedId, setSelectedId] = useState<string | null>(
    scenario === 'event-discovered' ? 'festival' : null
  );
  const [capture, setCapture] = useState(false);
  const [notes, setNotes] = useState<{ id: string; title: string }[]>([]);
  const [query, setQuery] = useState('');
  const selected = items.find((item) => item.id === selectedId) ?? null;
  const filtered = filterTripItems(items, query);
  function updateIntention(id: string, intention: TripOverviewItem['intention']) {
    setItems((current) => current.map((item) => (item.id === id ? { ...item, intention } : item)));
  }
  return (
    <div className="min-h-screen bg-background text-foreground">
      <OverviewReviewNotes layout={layout} />
      <main className="mx-auto max-w-7xl space-y-6 p-5 md:p-6">
        <OverviewHeading onCapture={() => setCapture(true)} />
        <OverviewSummary items={items} noteCount={notes.length} />
        <TextInput
          label="Find within this trip"
          placeholder="Search a city, event, person or idea…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <OverviewResults
          query={query}
          filtered={filtered}
          layout={layout}
          onSelect={(item) => setSelectedId(item.id)}
        />
        <OverviewInbox notes={notes} />
        <p role="status" className="text-xs text-muted-foreground">
          {items.filter((item) => item.intention === 'In plan').length} items in the working plan.
        </p>
      </main>
      <OverviewItemSheet
        item={selected}
        onClose={() => setSelectedId(null)}
        onPlan={updateIntention}
      />
      <OverviewCaptureSheet
        open={capture}
        onClose={() => setCapture(false)}
        onSave={(title) => setNotes((current) => [...current, { id: crypto.randomUUID(), title }])}
      />
    </div>
  );
}

function OverviewSummary({ items, noteCount }: { items: TripOverviewItem[]; noteCount: number }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-y py-3">
      <p className="text-sm text-muted-foreground">
        {items.filter(isPurchasedArrangement).length} purchased arrangements ·{' '}
        {items.filter((item) => item.intention !== 'In plan').length} possibilities
      </p>
      <Button asChild variant="ghost">
        <a href="#overview-inbox">
          <Inbox className="size-4" aria-hidden />
          Inbox ({noteCount})<ArrowDown className="size-4" aria-hidden />
        </a>
      </Button>
    </div>
  );
}

function OverviewResults({
  query,
  filtered,
  layout,
  onSelect,
}: {
  query: string;
  filtered: TripOverviewItem[];
  layout: TripOverviewLayout;
  onSelect: (item: TripOverviewItem) => void;
}) {
  return (
    <>
      {query && !filtered.length ? (
        <p role="status" className="rounded-xl border border-dashed p-8 text-muted-foreground">
          No matches. Try a different name or clear the search.
        </p>
      ) : (
        <OverviewLayout layout={layout} items={filtered} onSelect={onSelect} />
      )}
    </>
  );
}
