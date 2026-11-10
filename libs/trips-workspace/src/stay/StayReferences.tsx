import { Chip } from '@pops/ui';

import { referenceEntries } from '../reference-entries';

import type { JSX } from 'react';

import type { Stay, StayPatch } from './types';

/** Display/remove opaque references without claiming that their source owner resolved them. */
export function StayReferences({
  stay,
  commit,
}: {
  stay: Stay;
  commit: (patch: StayPatch) => void;
}): JSX.Element {
  return (
    <div className="space-y-3">
      {groups.map(({ field, label }) => (
        <section key={field} aria-label={label} className="space-y-2">
          <h2 className="text-sm font-medium">{label}</h2>
          {stay[field].length === 0 ? (
            <p className="text-sm text-muted-foreground">No links recorded</p>
          ) : (
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
          )}
        </section>
      ))}
    </div>
  );
}

const groups = [
  { field: 'hostLinks', label: 'Host' },
  { field: 'documentLinks', label: 'Documents' },
  { field: 'sourceLinks', label: 'Sources' },
] satisfies { field: 'hostLinks' | 'documentLinks' | 'sourceLinks'; label: string }[];
