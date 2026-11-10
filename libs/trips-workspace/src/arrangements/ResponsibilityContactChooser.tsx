import { Suspense, useEffect, useRef, useState } from 'react';

import { Button } from '@pops/ui';

import type { JSX } from 'react';

import type { ContactChooserIntent } from '@pops/pillar-sdk';

import type { ArrangementTarget, ArrangementsWorkspaceProps } from './types';

/** Mount the owner's retained picker intent; only its issued selection can replace responsibility. */
export function ResponsibilityContactChooser({
  identity,
  target,
  disabled,
  select,
}: {
  identity: ArrangementsWorkspaceProps;
  target: ArrangementTarget;
  disabled: boolean;
  select: (uri: string, intent: ContactChooserIntent) => void;
}): JSX.Element | null {
  const [intent, setIntent] = useState<ContactChooserIntent>();
  const [open, setOpen] = useState(false);
  const isOpen = useRef(false);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  function changeOpen(value: boolean): void {
    isOpen.current = value;
    setOpen(value);
  }
  const getIntent = identity.contactChooserIntent;
  if (!getIntent) return null;
  const Chooser = intent?.Chooser;
  return (
    <>
      <Button
        variant="outline"
        className="min-h-11"
        disabled={disabled}
        onClick={() => {
          setIntent(getIntent(target));
          changeOpen(true);
        }}
      >
        {identity.labels.chooseContact}
      </Button>
      {Chooser && open && (
        <Suspense fallback={<p role="status">{identity.labels.loading}</p>}>
          <Chooser
            open={open}
            onOpenChange={changeOpen}
            onSelect={(selection) => {
              if (!mounted.current || !isOpen.current || disabled || !intent) return;
              changeOpen(false);
              select(selection.reference.uri, intent);
            }}
          />
        </Suspense>
      )}
    </>
  );
}
