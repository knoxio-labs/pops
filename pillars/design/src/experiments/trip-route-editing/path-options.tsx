import { presentTripRecord } from '@/fixtures/trip-overview-format';
import { Check } from 'lucide-react';

import { Badge, Button } from '@pops/ui';

import { DirectFields } from './direct-fields';
import { DirectItems } from './direct-items';
import { VisitLinks } from './route-row';

import type { TripRecord } from '@/fixtures/trip-overview-model';

import type { PlannerState } from './model';

/** Alternatives share one route position; choosing one keeps the others available. */
export function PathOptions({
  gap,
  state,
  onChoose,
  onEdit,
  direct = false,
}: {
  gap: TripRecord;
  state: PlannerState;
  onChoose: (id: string) => void;
  onEdit: (record: TripRecord) => void;
  direct?: boolean;
}) {
  const display = presentTripRecord(gap, state.records);
  const options = state.records.filter((r) => gap.optionIds?.includes(r.id));
  return (
    <section
      aria-label="Route alternatives"
      className="space-y-4 rounded-xl border border-dashed p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">{display.when}</h2>
        <Badge variant="outline">{options.length} alternatives</Badge>
      </div>
      <div className={direct ? 'space-y-3' : 'grid gap-3 sm:grid-cols-2'}>
        {options.map((option) => (
          <PathOption
            key={option.id}
            option={option}
            state={state}
            chosen={state.choices[gap.id] === option.id}
            onChoose={() => onChoose(option.id)}
            onEdit={onEdit}
            direct={direct}
          />
        ))}
      </div>
    </section>
  );
}

function PathOption({
  option,
  state,
  chosen,
  onChoose,
  onEdit,
  direct = false,
}: {
  option: TripRecord;
  state: PlannerState;
  chosen: boolean;
  onChoose: () => void;
  onEdit: (record: TripRecord) => void;
  direct?: boolean;
}) {
  const display = presentTripRecord(option, state.records);
  return (
    <div className="space-y-3 rounded-lg border border-dashed bg-card p-3">
      {direct ? (
        <DirectFields record={option} onChange={onEdit} />
      ) : (
        <>
          <h3 className="font-semibold">{display.title}</h3>
          {display.when && <p className="text-sm">{display.when}</p>}
        </>
      )}
      {direct ? (
        <DirectItems visit={option} records={state.records} />
      ) : (
        <VisitLinks record={option} records={state.records} />
      )}

      <Button
        variant={chosen ? 'secondary' : 'outline'}
        className="w-full"
        onClick={onChoose}
        aria-pressed={chosen}
      >
        {chosen && <Check className="size-4" aria-hidden />}
        {chosen ? 'In working route' : 'Use this path'}
      </Button>
      {!direct && (
        <Button variant="ghost" className="w-full" onClick={() => onEdit(option)}>
          Edit timing
        </Button>
      )}
    </div>
  );
}
