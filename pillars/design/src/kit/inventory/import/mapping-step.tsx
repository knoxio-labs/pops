/**
 * Step two: each file column, a few of its values, and the item field it
 * feeds. Headers POPS recognises are matched already; the rest start as
 * Not imported. Problems that stop the next step are listed beside it.
 */
import { ArrowRight } from 'lucide-react';

import { Select, cn } from '@pops/ui';

import { BULK_COLUMNS } from '../bulk-entry/paste-parser';
import { ListBody } from '../items-list/list-page';
import { fieldName, mappingProblems } from './import-model';

import type { ColumnMapping, ColumnTarget } from './import-model';

const OPTIONS = [...BULK_COLUMNS, 'skip' as const].map((target: ColumnTarget) => ({
  value: target,
  label: fieldName(target),
}));

/** Props for {@link MappingStep}. */
export interface MappingStepProps {
  mapping: readonly ColumnMapping[];
  rows: readonly (readonly string[])[];
  /** `header:field` pairs the first guess made on its own. */
  guessed: ReadonlySet<string>;
}

function source(column: ColumnMapping, guessed: boolean): string {
  if (column.target === 'skip') return 'Left out';
  return guessed ? 'Matched by its name' : 'Chosen by you';
}

function MappingRow({
  column,
  samples,
  guessed,
}: {
  column: ColumnMapping;
  samples: readonly string[];
  guessed: boolean;
}) {
  return (
    <div role="row" className="flex h-15 items-center gap-4 border-b px-4 last:border-b-0">
      <span className="w-40 truncate text-sm font-medium">{column.header}</span>
      <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
        {samples.join(', ')}
      </span>
      <ArrowRight className="size-4 text-muted-foreground" aria-hidden />
      <div className="w-52">
        <Select
          size="sm"
          aria-label={`${column.header} becomes`}
          value={column.target}
          options={OPTIONS}
          onChange={() => undefined}
          className={cn(column.target === 'skip' && 'text-muted-foreground')}
        />
        <p className="mt-0.5 text-2xs text-muted-foreground">{source(column, guessed)}</p>
      </div>
    </div>
  );
}

function MappingAside({ mapping }: { mapping: readonly ColumnMapping[] }) {
  const problems = mappingProblems(mapping);
  const kept = mapping.filter((column) => column.target !== 'skip').length;
  return (
    <aside className="w-72 shrink-0 space-y-3 text-sm">
      <h2 className="text-sm font-medium">
        {problems.length === 0 ? 'Ready to check rows' : 'Before checking rows'}
      </h2>
      {problems.length === 0 ? (
        <p className="text-muted-foreground">
          {`${String(kept)} of ${String(mapping.length)} columns are imported. Values in the others are not kept.`}
        </p>
      ) : (
        <ul className="space-y-2">
          {problems.map((problem) => (
            <li
              key={problem.target}
              className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2"
            >
              {problem.message}
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}

/** The mapping step. */
export function MappingStep({ mapping, rows, guessed }: MappingStepProps) {
  return (
    <div className="flex min-h-0 flex-1 gap-4">
      <ListBody>
        <div role="table" aria-label="Column matches">
          <div
            role="row"
            className="sticky top-0 z-10 flex h-9 items-center gap-4 border-b bg-card px-4 text-2xs font-semibold tracking-label text-muted-foreground uppercase"
          >
            <span className="w-40">Column in the file</span>
            <span className="min-w-0 flex-1">First values</span>
            <span className="w-4" />
            <span className="w-52">Becomes</span>
          </div>
          {mapping.map((column, index) => (
            <MappingRow
              key={column.header}
              column={column}
              samples={rows.slice(0, 4).map((cells) => cells[index] || '(empty)')}
              guessed={guessed.has(`${column.header}:${column.target}`)}
            />
          ))}
        </div>
      </ListBody>
      <MappingAside mapping={mapping} />
    </div>
  );
}
