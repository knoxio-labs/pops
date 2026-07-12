import { ImportWarningBanner } from '../ImportWarningBanner';

import type { ImportWarning } from '@pops/finance';

export function ReviewWarnings({ warnings }: { warnings?: ImportWarning[] }) {
  if (!warnings || warnings.length === 0) return null;
  return (
    <div className="space-y-2">
      {warnings.map((warning) => (
        <ImportWarningBanner
          key={warning.type}
          warning={warning}
          affectedHint=" and may appear in the Uncertain or Failed tabs."
        />
      ))}
    </div>
  );
}
