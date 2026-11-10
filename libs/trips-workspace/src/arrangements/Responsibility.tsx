import { Button, ErrorState } from '@pops/ui';

import { requestProblem } from '../stay/api';
import { ContactReference, ReferenceDetails } from './ContactReference';
import { ResponsibilityContactChooser } from './ResponsibilityContactChooser';
import { useResponsibility } from './use-responsibility';

import type { JSX } from 'react';

import type {
  ArrangementResponsibility,
  ArrangementTarget,
  ArrangementsWorkspaceProps,
} from './types';
import type { ResponsibilityEditor } from './use-responsibility';

/** Edit responsibility independently; clearing a stale contact never contacts its owner. */
export function Responsibility({
  identity,
  target,
}: {
  identity: ArrangementsWorkspaceProps;
  target: ArrangementTarget;
}): JSX.Element {
  const labels = identity.labels;
  const editor = useResponsibility(identity, target);
  return (
    <section className="space-y-2 border-t border-border pt-4" aria-label={labels.handledBy}>
      <h2 className="text-sm font-medium">{labels.handledBy}</h2>
      {editor.query.isPending && <p role="status">{labels.loading}</p>}
      {editor.query.isError && (
        <ErrorState
          error={requestProblem(editor.query.error)}
          onRetry={() => void editor.query.refetch()}
        />
      )}
      {editor.query.data && (
        <ResponsibilityControls identity={identity} source={editor.query.data} editor={editor} />
      )}
      {editor.failure && (
        <>
          <p role="status" className="text-sm text-muted-foreground">
            {labels.responsibilityUncertain}
          </p>
          <ErrorState
            error={requestProblem(editor.failure.error)}
            onRetry={() => void editor.retry()}
          />
          <Button
            variant="ghost"
            className="min-h-11"
            disabled={editor.busy}
            onClick={() => void editor.reload()}
          >
            {labels.reload}
          </Button>
          <Button
            variant="outline"
            className="min-h-11"
            disabled={editor.busy}
            onClick={() => void editor.reconcile()}
          >
            {labels.reconcileResponsibility}
          </Button>
        </>
      )}
    </section>
  );
}
function ResponsibilityControls({
  identity,
  source,
  editor,
}: {
  identity: ArrangementsWorkspaceProps;
  source: ArrangementResponsibility;
  editor: ResponsibilityEditor;
}): JSX.Element {
  const { labels } = identity;
  const owner = source.responsibility;
  const disabled = editor.busy || editor.failure !== undefined;
  return (
    <>
      <p className="text-sm">
        {owner?.kind === 'contact' ? (
          <ContactReference identity={identity} uri={owner.uri} interactive />
        ) : (
          ownerLabel(owner, identity)
        )}
      </p>
      {owner?.kind === 'contact' && <ReferenceDetails identity={identity} value={owner.uri} />}
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          className="min-h-11"
          disabled={disabled}
          onClick={() => void editor.save(source, { kind: 'self' })}
        >
          {labels.self}
        </Button>
        <Button
          variant="ghost"
          className="min-h-11"
          disabled={disabled || owner === null}
          onClick={() => void editor.save(source, null)}
        >
          {labels.clear}
        </Button>
      </div>
      <ResponsibilityContactChooser
        identity={identity}
        target={source}
        disabled={disabled}
        select={(uri, intent) => void editor.save(source, { kind: 'contact', uri }, intent)}
      />
    </>
  );
}
function ownerLabel(
  owner: ArrangementResponsibility['responsibility'],
  identity: ArrangementsWorkspaceProps
): string {
  if (owner?.kind === 'contact') return identity.labels.contactReference;
  return owner?.kind === 'self' ? identity.labels.self : identity.labels.unset;
}
