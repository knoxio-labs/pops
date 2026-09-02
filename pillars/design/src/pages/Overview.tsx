import { Link } from 'react-router';

import { Badge, Card, CardContent, CardHeader, CardTitle } from '@pops/ui';

import { areasOf, catalog } from '../registry';
import { buildAddress } from '../shell/address';

import type { ExperimentEntry, ScreenEntry } from '../registry';

const CONCEPTS: [string, string][] = [
  ['Screen', 'one file under src/screens/<area>/; a folder is a flow of steps'],
  ['Experiment', 'a question about one screen, in experiment.yaml'],
  ['Variant', 'a competing answer — its screens override main by path'],
  ['State', 'a named condition of a screen, exported beside it'],
];

function splitId(screenId: string): { area: string; slug: string } {
  const [area = '', slug = ''] = screenId.split('/');
  return { area, slug };
}

function AreaCard({ area, screens }: { area: string; screens: ScreenEntry[] }) {
  return (
    <Card className="gap-3 py-4">
      <CardHeader className="px-4">
        <CardTitle className="text-sm tracking-wider uppercase">{area}</CardTitle>
      </CardHeader>
      <CardContent className="px-4">
        <ul className="space-y-1">
          {screens.map((screen) => (
            <li key={screen.id} className="flex items-center justify-between gap-2 text-sm">
              <Link to={buildAddress(splitId(screen.id))} className="hover:underline">
                {screen.title}
              </Link>
              <span className="text-xs text-muted-foreground tabular-nums">
                {screen.steps ? `${screen.steps.length} steps` : ''}
                {screen.states ? ` · ${Object.keys(screen.states).length} states` : ''}
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function ExperimentRow({ exp }: { exp: ExperimentEntry }) {
  const variant = exp.status === 'active' ? 'default' : 'outline';
  return (
    <li className="flex flex-col gap-1 border-b border-border py-3 last:border-0">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">{exp.name}</span>
        <Badge variant={variant}>{exp.status}</Badge>
        <span className="text-xs text-muted-foreground">{exp.screen}</span>
      </div>
      {exp.question ? <p className="text-sm text-muted-foreground">{exp.question}</p> : null}
      <p className="text-xs text-muted-foreground">
        {exp.variants.map((v) => v.name).join(' · ')}
        {exp.chosen ? ` — chose ${exp.chosen}` : ''}
      </p>
    </li>
  );
}

/** The front page: what is here, and how the place works in four lines. */
export function Overview() {
  const areas = areasOf(catalog.screens);
  return (
    <div className="mx-auto max-w-4xl overflow-y-auto p-8">
      <h1 className="text-2xl font-bold tracking-tight">POPS Design</h1>
      <p className="mt-1 mb-6 text-sm text-muted-foreground">
        Design before implementing: screens built on the product&apos;s own tokens and components,
        reviewed here, then promoted.
      </p>
      <dl className="mb-8 grid grid-cols-1 gap-x-6 gap-y-1 text-xs sm:grid-cols-2">
        {CONCEPTS.map(([term, definition]) => (
          <div key={term}>
            <dt className="inline font-medium">{term}</dt>
            <dd className="inline text-muted-foreground"> — {definition}</dd>
          </div>
        ))}
      </dl>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {areas.map((area) => (
          <AreaCard
            key={area}
            area={area}
            screens={catalog.screens.filter((s) => s.area === area)}
          />
        ))}
      </div>
      {catalog.experiments.length > 0 ? (
        <section className="mt-8">
          <h2 className="mb-2 text-sm font-semibold tracking-wider text-muted-foreground uppercase">
            Experiments
          </h2>
          <ul>
            {catalog.experiments.map((exp) => (
              <ExperimentRow key={exp.id} exp={exp} />
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
