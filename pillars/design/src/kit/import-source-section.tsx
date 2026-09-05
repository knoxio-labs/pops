import { type ConnectionState, type ImportConfig } from '@/fixtures/import-sources';
import { importKindLabel, ImportSourceBadge } from '@/kit/import-source-badge';
import { CircleCheck, CircleDashed, KeyRound, Pencil } from 'lucide-react';

import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from '@pops/ui';

import type { Account } from '@/fixtures/accounts';

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[8rem_minmax(0,1fr)] items-baseline gap-3 text-sm">
      <dt className="text-xs tracking-wide text-muted-foreground uppercase">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}

const CONNECTION: Record<
  ConnectionState,
  { label: string; icon: typeof CircleCheck; variant: 'secondary' | 'outline' | 'destructive' }
> = {
  connected: { label: 'Connected', icon: CircleCheck, variant: 'secondary' },
  'token-missing': { label: 'Token missing', icon: KeyRound, variant: 'destructive' },
  'not-connected': { label: 'Not connected', icon: CircleDashed, variant: 'outline' },
};

/**
 * An `api` source's connection, said in the terms the operator can act on.
 * The token itself never appears here — it is a docker secret — so the one
 * thing worth showing is the NAME the pillar expects it under, which is what
 * a missing-token state needs the reader to go and set.
 */
function Connection({ config }: { config: ImportConfig }) {
  const state = CONNECTION[config.connection ?? 'not-connected'];
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge variant={state.variant} className="gap-1 font-normal">
        <state.icon className="h-3 w-3" />
        {state.label}
      </Badge>
      {config.connection === 'connected' && config.externalAccount && (
        <span className="text-muted-foreground">as {config.externalAccount}</span>
      )}
      {config.secretName && (
        <span className="text-xs text-muted-foreground">
          token read from secret <code className="rounded bg-muted px-1">{config.secretName}</code>
        </span>
      )}
    </div>
  );
}

function cadenceLabel(days: number | undefined): string {
  if (days === undefined) return 'Not set';
  if (days === 1) return 'Daily';
  if (days === 7) return 'Weekly';
  if (days >= 28 && days <= 31) return 'Monthly';
  return `Every ${days} days`;
}

/**
 * How the account is fed. A hand-fed account has no config and says so
 * rather than showing empty fields: the honest state of a wallet is not
 * "unconfigured", it is that nothing feeds it but a person.
 */
export function ImportSourceSection({
  account,
  config,
}: {
  account: Account;
  config?: ImportConfig;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm font-medium">Source</CardTitle>
        <Button variant="ghost" size="sm">
          <Pencil className="h-4 w-4" />
          {config ? 'Change' : 'Set up'}
        </Button>
      </CardHeader>
      <CardContent>
        {config ? (
          <dl className="space-y-3">
            <Row label="Fed by">
              <ImportSourceBadge kind={config.kind} format={config.format} />
            </Row>
            <Row label="Format">
              {config.format} ({importKindLabel(config.kind).toLowerCase()})
            </Row>
            <Row label="Cadence">{cadenceLabel(config.expectedCadenceDays)}</Row>
            {config.kind === 'api' && (
              <Row label="Connection">
                <Connection config={config} />
              </Row>
            )}
          </dl>
        ) : (
          <p className="text-sm text-muted-foreground">
            Nothing feeds {account.name} on its own. Rows arrive when you import a file or add them
            by hand.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
