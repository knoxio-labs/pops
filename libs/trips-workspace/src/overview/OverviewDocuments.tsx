import { Button } from '@pops/ui';

import { sourceAction } from './source-action';

import type { JSX } from 'react';

import type { OverviewDocument, OverviewViewProps } from './types';

/** Explicit document associations retain both original identities and exact owning target references. */
export function OverviewDocuments(props: OverviewViewProps): JSX.Element | null {
  if (!props.sources.documents?.length) return null;
  return (
    <section aria-label={props.labels.documents} className="space-y-2">
      <h2 className="border-b pb-2 text-lg font-semibold">{props.labels.documents}</h2>
      <ul className="divide-y divide-border">
        {props.sources.documents.map((document) => (
          <li key={document.id} className="break-words py-2 text-sm">
            <p>{props.labels.source('document', document.documentId)}</p>
            <DocumentTarget {...props} document={document} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function DocumentTarget(props: OverviewViewProps & { document: OverviewDocument }): JSX.Element {
  const { document } = props;
  const title = props.labels.source(document.targetKind, document.targetId);
  const action =
    document.targetKind === 'trip'
      ? {}
      : sourceAction(props, { kind: document.targetKind, id: document.targetId });
  if (action.onOpen)
    return (
      <Button
        variant="link"
        onClick={action.onOpen}
        className="min-h-11 px-0 text-xs text-muted-foreground"
      >
        {title}
      </Button>
    );
  if (action.href)
    return (
      <a
        href={action.href}
        className="flex min-h-11 items-center text-xs text-muted-foreground underline"
      >
        {title}
      </a>
    );
  return <p className="text-xs text-muted-foreground">{title}</p>;
}
