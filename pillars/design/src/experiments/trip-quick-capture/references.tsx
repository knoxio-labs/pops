import { formatCityTiming } from '@/fixtures/trip-overview-format';

import { Select } from '@pops/ui';

import { initialCanvas, canvasName } from '../trip-route-editing/canvas-model';

const canvas = initialCanvas('default');
const visits = canvas.records.filter((record) => record.kind === 'city');
const options = visits.map((record) => {
  const name = canvasName(canvas, record);
  const sameName = visits.filter((visit) => canvasName(canvas, visit) === name);
  const occurrence = sameName.length > 1 ? ` · ${sameName.indexOf(record) + 1}` : '';
  return {
    value: record.id,
    label:
      `${name}${occurrence}${record.timing ? ` · ${formatCityTiming(record.timing)}` : ''}`.replace(
        / · $/,
        ''
      ),
  };
});

/** Format a selected visit from its source record; missing identities never leak into copy. */
export function captureVisitLabel(id: string): string {
  return (
    options.find((option) => option.value === id)?.label ?? (id ? 'Visit unavailable' : 'Inbox')
  );
}

/** Capture may belong to the inbox or any existing visit, including an alternative. */
export function CaptureVisit({
  value,
  onChange,
}: {
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <Select
      aria-label="Capture destination"
      variant="ghost"
      containerClassName="bg-transparent"
      value={value}
      options={[
        { value: '', label: 'Inbox' },
        ...(value && !options.some((option) => option.value === value)
          ? [{ value, label: 'Visit unavailable' }]
          : []),
        ...options,
      ]}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}
