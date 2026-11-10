import { Suspense } from 'react';

import { Button, ErrorBoundary } from '@pops/ui';

import { referenceEntries } from '../reference-entries';
import { useSourceContactChooser } from './use-source-contact-chooser';

import type { JSX } from 'react';

import type { SourceContactSession } from './session';

interface ChooserProps {
  session: SourceContactSession;
  intentKey: string;
  chooseLabel: string;
  recoverLabel: string;
  showRecovery: boolean;
  links: readonly { uri: string }[];
  disabled: boolean;
  select: (uri: string) => void;
}
/** Retain owner-created references before applying a source write; replaced views cannot apply callbacks. */
export function SourceContactChooser(props: ChooserProps): JSX.Element {
  const { session, disabled, select } = props;
  const chooser = useSourceContactChooser(session, props.intentKey, disabled, select);
  const Chooser = chooser.attempt?.chooser.Chooser;
  return (
    <div className="space-y-2">
      <Button
        variant="outline"
        className="min-h-11"
        disabled={disabled || !session.context.contacts || !session.isCurrent()}
        onClick={chooser.start}
      >
        {props.chooseLabel}
      </Button>
      {!session.context.contacts && (
        <p role="status" className="text-sm text-muted-foreground">
          Contacts chooser unavailable
        </p>
      )}
      {props.showRecovery && <RetainedSelections {...props} />}
      {Chooser && chooser.open && (
        <ErrorBoundary fallback={chooserUnavailable}>
          <Suspense fallback={<p role="status">Loading Contacts chooser…</p>}>
            <Chooser
              open={chooser.open}
              onOpenChange={chooser.changeOpen}
              onSelect={chooser.selectOwner}
            />
          </Suspense>
        </ErrorBoundary>
      )}
    </div>
  );
}
function RetainedSelections({
  session,
  links,
  disabled,
  select,
  recoverLabel,
}: ChooserProps): JSX.Element {
  const receipts = session.receipts.filter(
    (receipt) => !links.some((link) => link.uri === receipt.reference.uri)
  );
  return (
    <>
      {referenceEntries(
        receipts.map((receipt) => ({ uri: receipt.reference.uri, label: receipt.name }))
      ).map(({ link, key }) => (
        <div key={key} className="space-y-1">
          <p className="text-sm">Selected in Contacts: {link.label}</p>
          <Button
            variant="outline"
            className="min-h-11"
            disabled={disabled || !session.isCurrent()}
            onClick={() => {
              if (session.isCurrent()) select(link.uri);
            }}
          >
            {recoverLabel}
          </Button>
        </div>
      ))}
    </>
  );
}
function chooserUnavailable(): JSX.Element {
  return <p role="alert">Contacts chooser unavailable</p>;
}
