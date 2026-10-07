import { GUEST_EMAIL } from '@/fixtures/sharing';
import { GuestChrome } from '@/screens/shell/guest-shell';
import { Clock, Smartphone, TriangleAlert } from 'lucide-react';

import { Button, Card, CardContent, PageHeader, QrCode, Skeleton, SuccessBurst } from '@pops/ui';

import type { ScreenMeta, ScreenStates } from '@/contract';
import type { ReactNode } from 'react';

/**
 * Where a guest signs the POPS app in on their own phone. The code is theirs:
 * it binds the phone to the email they are signed in with, and nobody types
 * an email anywhere. It is the operator's pairing dialog laid out as a page,
 * because a guest has no devices list to open it from.
 */
export const meta: ScreenMeta = { title: 'Pair iPhone, guest', order: 2, frame: 'none' };

/** Not a pairing code: a fixed string, so the symbol on the canvas is the right density and opens nothing. */
const SAMPLE_PAYLOAD = 'pops-design-playground:sample-pairing-symbol:not-a-code';

function Panel({
  visual,
  title,
  children,
}: {
  visual: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <Card className="m-auto w-full max-w-sm">
      <CardContent className="flex flex-col items-center gap-3 pt-6 text-center">
        <div className="flex size-44 items-center justify-center">{visual}</div>
        <h2 className="text-base font-semibold">{title}</h2>
        {children}
      </CardContent>
    </Card>
  );
}

const body = 'text-sm text-muted-foreground';
const mark = 'size-12 text-muted-foreground/40';

function Page({ children }: { children: ReactNode }) {
  return (
    <GuestChrome active="pair">
      <PageHeader title="Pair iPhone" description={`Sign the POPS app in as ${GUEST_EMAIL}.`} />
      {children}
    </GuestChrome>
  );
}

function Code() {
  return (
    <Page>
      <Panel
        visual={<QrCode value={SAMPLE_PAYLOAD} title="Pairing QR code" className="size-44" />}
        title="Scan this with the POPS app"
      >
        <p className="text-sm tabular-nums">Expires in 4:32</p>
        <p className={body}>The code is shown once. If you lose it, make another.</p>
        <Button variant="outline">Done</Button>
      </Panel>
    </Page>
  );
}

function Failure({ message }: { message: string }) {
  return (
    <Page>
      <Panel visual={<TriangleAlert className={mark} aria-hidden />} title="No code was made">
        <p className={body}>{message}</p>
        <Button variant="outline">Try again</Button>
      </Panel>
    </Page>
  );
}

export const states: ScreenStates = {
  making: () => (
    <Page>
      <Panel visual={<Skeleton className="size-44" />} title="Making a code">
        <p className={body}>This takes a moment.</p>
      </Panel>
    </Page>
  ),
  code: Code,
  expired: () => (
    <Page>
      <Panel visual={<Clock className={mark} aria-hidden />} title="That code has expired">
        <p className={body}>Codes only last a few minutes. Make another to carry on.</p>
        <Button>Make another</Button>
      </Panel>
    </Page>
  ),
  paired: () => (
    <Page>
      <Panel visual={<SuccessBurst label="Pairing complete" />} title="iPhone paired">
        <p className={body}>
          iPhone 17 is ready to use. On the phone you can look, add, edit and attach. Deleting and
          restoring stay here on the web.
        </p>
        <Button variant="outline">Pair another iPhone</Button>
      </Panel>
    </Page>
  ),
  unavailable: () => <Failure message="POPS did not answer, so no code was made." />,
  'too-many': () => (
    <Failure message="Too many codes were made just now. Wait a minute and try again." />
  ),
};

export default function GuestPairIphoneScreen() {
  return (
    <Page>
      <Panel visual={<Smartphone className={mark} aria-hidden />} title="Pair your iPhone">
        <p className={body}>
          Install the POPS app, then show a code here and scan it from the app. The phone signs in
          as you and sees the accounts shared with you.
        </p>
        <Button>Show pairing code</Button>
      </Panel>
    </Page>
  );
}
