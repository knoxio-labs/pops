import { TriangleAlert } from 'lucide-react';

import { visitFindings } from './findings';

import type { JSX } from 'react';

import type { Stay, Visit } from './types';

/** Compact nonblocking source discrepancies, retaining editable contradictory visit dates. */
export function VisitFindings({
  visit,
  stays,
}: {
  visit: Visit;
  stays: Stay[];
}): JSX.Element | null {
  const findings = visitFindings(visit, stays);
  if (!findings.length) return null;
  return (
    <section aria-label="Visit findings" className="space-y-2">
      {findings.map((finding) => (
        <p key={finding.id} className="flex gap-2 text-sm text-destructive">
          <TriangleAlert className="size-4 shrink-0" aria-hidden />
          {finding.message}
        </p>
      ))}
    </section>
  );
}
