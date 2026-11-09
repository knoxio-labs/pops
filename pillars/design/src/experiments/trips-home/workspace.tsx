import { Plus, RotateCcw, Search } from 'lucide-react';

import { Button, ComboboxSelect, TextInput } from '@pops/ui';

import { NewTripDialog } from './create';
import { homeTrips } from './model';
import { HomeTripPreview } from './preview';
import { HomeReview } from './review';
import { HomeRows, homeBucketOptions } from './rows';
import { useTripsHome } from './session';

import type { HomeBucket, HomeScenario } from './model';

/** Browses actual trip records and creates optional metadata without parsing timing intentions or inventing route dates. */
export function TripsHomeWorkspace({
  layout,
  scenario = 'default',
}: {
  layout: 'list' | 'grouped';
  scenario?: HomeScenario;
}) {
  const session = useTripsHome(scenario);
  const { history, open, setOpen, draft, update, error, selected, create, cancel } = session;
  return (
    <div className="min-h-screen bg-background text-foreground">
      <HomeReview layout={layout} referenceDate={history.state.referenceDate} />
      <main className="mx-auto max-w-5xl space-y-5 px-4 py-6 text-sm md:py-8">
        {selected ? (
          <HomeTripPreview
            state={history.state}
            trip={selected}
            back={() => session.select(null)}
          />
        ) : (
          <HomeBrowse session={session} layout={layout} />
        )}
        <NewTripDialog
          state={history.state}
          draft={draft}
          update={update}
          open={open}
          setOpen={setOpen}
          create={create}
          error={error}
          cancel={cancel}
        />
      </main>
    </div>
  );
}

function HomeToolbar({
  query,
  setQuery,
  bucket,
  setBucket,
  create,
}: {
  query: string;
  setQuery: (query: string) => void;
  bucket: 'all' | HomeBucket;
  setBucket: (bucket: 'all' | HomeBucket) => void;
  create: () => void;
}) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="min-w-40 flex-1">
        <TextInput
          aria-label="Search trips"
          placeholder="Search trips"
          className="text-sm"
          containerClassName="min-h-11"
          prefix={<Search className="size-4" aria-hidden />}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      <ComboboxSelect
        aria-label="View trips"
        className="min-h-11 w-40 text-sm"
        value={bucket}
        options={homeBucketOptions}
        onChange={(value) => {
          const option = homeBucketOptions.find((item) => item.value === value);
          if (option) setBucket(option.value);
        }}
      />
      <Button
        className="min-h-11 bg-app-accent text-app-accent-foreground text-sm hover:bg-app-accent/90"
        onClick={create}
      >
        <Plus className="size-4" aria-hidden /> New trip
      </Button>
    </div>
  );
}

function HomeBrowse({
  session,
  layout,
}: {
  session: ReturnType<typeof useTripsHome>;
  layout: 'list' | 'grouped';
}) {
  const { history, query, setQuery, bucket, setBucket, setOpen, select } = session;
  return (
    <>
      <header className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold leading-tight tracking-normal">Trips</h1>
        <Button
          variant="ghost"
          className="min-h-11 text-sm"
          disabled={!history.canUndo}
          onClick={history.undo}
        >
          <RotateCcw className="size-4" aria-hidden /> Undo
        </Button>
      </header>
      <HomeToolbar
        query={query}
        setQuery={setQuery}
        bucket={bucket}
        setBucket={setBucket}
        create={() => setOpen(true)}
      />
      <HomeRows
        state={history.state}
        trips={homeTrips(history.state, query, bucket)}
        grouped={layout === 'grouped'}
        select={select}
      />
    </>
  );
}
