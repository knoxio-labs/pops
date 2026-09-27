import { useState } from 'react';

import { Input } from '@pops/ui';

import type { ReactElement } from 'react';

import type { LocationModel } from '../../foundation/model/model.js';
import type { PlaceEditsApi } from './location-page-parts.js';

/** Renders the keyboard-first inline child-place creation row. */
export function InlineCreate({
  place,
  edits,
}: {
  place: LocationModel;
  edits: PlaceEditsApi;
}): ReactElement {
  const [value, setValue] = useState('');
  return (
    <div className="mb-2 flex min-h-11 items-center rounded-lg border bg-card px-3">
      <Input
        autoFocus
        aria-label={`Name the new place in ${place.name}`}
        placeholder={`Name the new place in ${place.name}, then Enter`}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            edits.commitCreate(value);
          }
          if (event.key === 'Escape') edits.cancelCreate();
        }}
      />
    </div>
  );
}
