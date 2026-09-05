import { feedVerb, importStatusFor } from '@/fixtures/import-status';

import type { Account } from '@/fixtures/accounts';

const day = (iso: string) =>
  new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });

/**
 * The one line the account page gets about its plumbing (POPS-2918): what
 * feeds it and when it last did, then a link to the page where the rest
 * lives. The page stays the result; this is the provenance of the result,
 * in the same breath as the checkpoint date beside it.
 */
export function fedByText(account: Account): string {
  const status = importStatusFor(account.id);
  const verb = feedVerb(status.kind);
  if (status.format === undefined) return 'Entered by hand';
  const last = status.lastAt ? `last ${verb} ${day(status.lastAt)}` : `never ${verb}ed`;
  return `Fed by ${status.format} · ${last}`;
}

export function ImportFedByLine({ account }: { account: Account }) {
  return (
    <p className="text-xs text-muted-foreground">
      {fedByText(account)}
      {' · '}
      <a
        href={`#/accounts/${account.id}/imports`}
        className="underline underline-offset-2 hover:text-foreground"
      >
        Imports
      </a>
    </p>
  );
}
