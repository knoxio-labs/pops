import { Chip } from '@pops/ui';

import type { JSX } from 'react';

import type { Journey } from './types';

/** Opaque provenance chips never claim document/contact resolution or transfer source ownership. */
export function SourceReferences({
  links,
  save,
}: {
  links: Journey['sourceLinks'];
  save: (links: Journey['sourceLinks']) => void;
}): JSX.Element {
  return (
    <section aria-label="Source links" className="flex flex-wrap gap-2">
      {entries(links).map(({ link, index, key }) => (
        <Chip
          key={key}
          removable
          variant="outline"
          removeLabel={`Remove source link ${index + 1}`}
          onRemove={() => save(links.filter((_, position) => position !== index))}
        >
          <span title={link.uri}>{link.label ?? link.uri}</span>
        </Chip>
      ))}
    </section>
  );
}

function entries(
  links: Journey['sourceLinks']
): { link: Journey['sourceLinks'][number]; index: number; key: string }[] {
  const counts = new Map<string, number>();
  return links.map((link, index) => {
    const content = JSON.stringify(link);
    const count = counts.get(content) ?? 0;
    counts.set(content, count + 1);
    return { link, index, key: `${content}:${count}` };
  });
}
