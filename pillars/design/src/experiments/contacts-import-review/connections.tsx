import { Cloud, RefreshCw } from 'lucide-react';
import { useState } from 'react';

import { Badge, Button, Card, CardContent, PageHeader, TextInput } from '@pops/ui';

import type { ScreenStates } from '@/contract';

type ConnectionState = 'connected' | 'disconnected' | 'loading' | 'error' | 'expired';
const copy = {
  connected: {
    title: 'Connected',
    message: 'Read only. Review before applying changes.',
    action: 'Prepare import',
  },
  disconnected: {
    title: 'Not connected',
    message: 'Connect to preview contacts.',
    action: 'Connect',
  },
  loading: { title: 'Connecting', message: 'Checking connection…', action: 'Connecting' },
  error: {
    title: 'Connection failed',
    message: 'No contacts changed. Check access and retry.',
    action: 'Retry connection',
  },
  expired: {
    title: 'Reconnect required',
    message: 'Access expired. Existing contacts remain available.',
    action: 'Reconnect',
  },
};

function IcloudForm({ notify }: { notify: (message: string) => void }) {
  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        notify('iCloud connection submitted. Checking access…');
      }}
    >
      <TextInput label="Apple account email" type="email" required />
      <TextInput label="App-specific password" type="password" autoComplete="off" required />
      <p className="text-xs text-muted-foreground">
        Use an app-specific password from your Apple account. Your regular account password is not
        accepted.
      </p>
      <Button type="submit">Connect iCloud</Button>
    </form>
  );
}

function ConnectedActions({
  provider,
  notify,
}: {
  provider: string;
  notify: (message: string) => void;
}) {
  return (
    <>
      <p>owner@example.test</p>
      <p className="text-sm text-muted-foreground">
        Last import 24 October · 6 contacts. No changes are sent to {provider}.
      </p>
      <Button
        onClick={() => notify(`${provider} preview ready. Review identities before importing.`)}
      >
        <RefreshCw className="size-4" />
        Prepare import
      </Button>
      <Button
        variant="ghost"
        onClick={() => notify(`${provider} disconnected. Imported people are retained.`)}
      >
        Disconnect
      </Button>
    </>
  );
}

function ProviderCard({
  provider,
  condition,
  notify,
}: {
  provider: string;
  condition: ConnectionState;
  notify: (message: string) => void;
}) {
  const [showForm, setShowForm] = useState(false);
  function connect() {
    if (provider === 'iCloud') setShowForm(true);
    else notify('Continue with Google to grant read-only contacts access.');
  }
  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Cloud className="size-5" />
            {provider}
          </h2>
          <Badge variant="outline">{copy[condition].title}</Badge>
        </div>
        <p className="text-sm text-muted-foreground">{copy[condition].message}</p>
        {condition === 'connected' ? (
          <ConnectedActions provider={provider} notify={notify} />
        ) : (
          <Button disabled={condition === 'loading'} onClick={connect}>
            {copy[condition].action}
          </Button>
        )}
        {showForm && <IcloudForm notify={notify} />}
      </CardContent>
    </Card>
  );
}

/** Provider connection states remain local and send no requests. */
export function Connections({ condition = 'connected' }: { condition?: ConnectionState }) {
  const [message, setMessage] = useState('');
  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <PageHeader
        title="Contact connections"
        description="Bring contacts into POPS. Review each import before applying changes."
      />
      {message && <p role="status">{message}</p>}
      <div className="grid gap-6 md:grid-cols-2">
        {['Google', 'iCloud'].map((provider) => (
          <ProviderCard
            key={provider}
            provider={provider}
            condition={condition}
            notify={setMessage}
          />
        ))}
      </div>
    </div>
  );
}
/** Provider boundaries include fresh setup, outage and expired access. */
export const connectionStates: ScreenStates = {
  empty: () => <Connections condition="disconnected" />,
  loading: () => <Connections condition="loading" />,
  error: () => <Connections condition="error" />,
  expired: () => <Connections condition="expired" />,
  success: () => <Connections />,
};
