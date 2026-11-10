import type { JSX } from 'react';

import type { ArrangementsWorkspaceProps } from './types';

/** An optional owner-issued label never asserts resolution; the original URI remains available in source details. */
export function ContactReference({
  identity,
  uri,
}: {
  identity: ArrangementsWorkspaceProps;
  uri: string;
}): JSX.Element {
  const Label = identity.ContactLabel;
  return Label ? <Label uri={uri} /> : <span>{identity.labels.contactReference}</span>;
}

/** Opaque source identity is a detail, independently available without a Contact catalogue request. */
export function ReferenceDetails({
  identity,
  value,
}: {
  identity: ArrangementsWorkspaceProps;
  value: string | number;
}): JSX.Element {
  return (
    <details className="text-sm">
      <summary className="min-h-11 cursor-pointer content-center">
        {identity.labels.referenceDetails}
      </summary>
      <code className="block break-all text-xs text-muted-foreground">{value}</code>
    </details>
  );
}
