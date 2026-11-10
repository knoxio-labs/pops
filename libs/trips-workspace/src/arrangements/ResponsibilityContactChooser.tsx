import { Suspense, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { Button } from '@pops/ui';

import { currentSourceOwner, sourceOwner } from './source-owner';

import type { JSX } from 'react';

import type { ContactChooserIntent } from '@pops/pillar-sdk';

import type { ArrangementResponsibilityContext } from './responsibility-context';
import type { SourceOwner } from './source-owner';
import type { ArrangementTarget } from './types';

type ChooserProps = {
  identity: ArrangementResponsibilityContext;
  target: ArrangementTarget;
  disabled: boolean;
  select: (uri: string, intent: ContactChooserIntent) => void;
};

/** Mount the owner's retained picker intent; only its issued selection can replace responsibility. */
export function ResponsibilityContactChooser(props: ChooserProps): JSX.Element | null {
  const { client, origin, tripId } = sourceOwner(props.identity);
  const { targetKind, targetId } = props.target;
  const context = useMemo(
    () => ({
      owner: Object.freeze({ client, origin, tripId }),
      target: Object.freeze({ targetKind, targetId }),
      viewId: crypto.randomUUID(),
    }),
    [client, origin, tripId, targetKind, targetId]
  );
  if (!props.identity.contactChooserIntent) return null;
  return (
    <ScopedChooser key={context.viewId} {...props} target={context.target} owner={context.owner} />
  );
}

function ScopedChooser({
  identity,
  target,
  disabled,
  select,
  owner,
}: ChooserProps & { owner: SourceOwner }): JSX.Element {
  const [operation, setOperation] = useState<{ intent: ContactChooserIntent }>();
  const active = useRef(operation);
  const current = useRef({ mounted: false, disabled, select });
  useLayoutEffect(() => {
    current.current = { mounted: true, disabled, select };
    return () => {
      current.current.mounted = false;
    };
  });
  function isCurrent(): boolean {
    return current.current.mounted && currentSourceOwner(owner, sourceOwner(identity));
  }
  function close(): void {
    active.current = undefined;
    setOperation(undefined);
  }
  const Chooser = operation?.intent.Chooser;
  return (
    <>
      <Button
        variant="outline"
        className="min-h-11"
        disabled={disabled}
        onClick={() => {
          if (!isCurrent() || current.current.disabled || !identity.contactChooserIntent) return;
          const next = { intent: identity.contactChooserIntent(target) };
          active.current = next;
          setOperation(next);
        }}
      >
        {identity.labels.chooseContact}
      </Button>
      {Chooser && operation && (
        <Suspense fallback={<p role="status">{identity.labels.loading}</p>}>
          <Chooser
            open
            onOpenChange={(open) => {
              if (!isCurrent() || active.current !== operation) return;
              if (!open) close();
            }}
            onSelect={(selection) => {
              if (!isCurrent() || active.current !== operation || current.current.disabled) return;
              close();
              current.current.select(selection.reference.uri, operation.intent);
            }}
          />
        </Suspense>
      )}
    </>
  );
}
