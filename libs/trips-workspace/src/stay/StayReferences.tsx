import { Chip } from '@pops/ui';

import { referenceEntries } from '../reference-entries';

import type { JSX } from 'react';

import type { Stay, StayPatch } from './types';

/** Show stored opaque provenance separately from owner-backed Host and Documents actions; absent groups add no empty rows. */
export function StayReferences({
  stay,
  commit,
}: {
  stay: Stay;
  commit: (patch: StayPatch) => void;
}): JSX.Element {
  return (
    <div className="space-y-3">
      {groups
        .filter(({ field }) => stay[field].length > 0)
        .map(({ field, label }) => (
          <section key={field} aria-label={label} className="space-y-2">
            <h2 className="text-sm font-medium">{label}</h2>
            <div className="flex flex-wrap gap-3">
              {referenceEntries(stay[field]).map(({ link, index, key }) => (
                <Chip
                  key={key}
                  variant="outline"
                  className="max-w-full"
                  removable
                  removeLabel={`Remove ${label.toLowerCase()} link ${index + 1}`}
                  onRemove={() =>
                    commit({ [field]: stay[field].filter((_, position) => index !== position) })
                  }
                >
                  <span title={link.uri}>{link.label ?? link.uri}</span>
                </Chip>
              ))}
            </div>
          </section>
        ))}
    </div>
  );
}
const groups = [
  { field: 'documentLinks', label: 'Document references' },
  { field: 'sourceLinks', label: 'Sources' },
] satisfies { field: 'documentLinks' | 'sourceLinks'; label: string }[];
