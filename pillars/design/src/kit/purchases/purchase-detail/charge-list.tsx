import { formatCents } from '@pops/ui';

import { chargeHeadingLine, chargeMetaLine, confidenceLabel, linkStatusLabel } from './format';
import { LINK_TYPE_LABELS } from './labels';

import type { ChargeLink, OrderCharge } from '@/fixtures/purchases-order-types';

/**
 * What was actually charged, and what each charge is linked to.
 *
 * A confirmed link and a proposed one are told apart here as they are in
 * the reconcile queue: a proposal is the engine's guess and survives only
 * until the next sweep disagrees, so rendering the two alike would present
 * a guess as a decision. The transaction is shown as its `pops://` URI
 * because it lives in another pillar and this screen resolves nothing
 * across that seam.
 */
export function ChargeList({ charges }: { charges: OrderCharge[] }) {
  if (charges.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nothing has been charged against this order yet.
      </p>
    );
  }

  return (
    <ul aria-label="Charges on this order" className="space-y-3">
      {charges.map((entry) => (
        <ChargeRow key={entry.charge.id} entry={entry} />
      ))}
    </ul>
  );
}

function ChargeRow({ entry }: { entry: OrderCharge }) {
  const { charge, links, allocations } = entry;
  return (
    <li data-charge-id={charge.id} data-charge-role={charge.role} className="rounded-md border p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-medium">{chargeHeadingLine(charge)}</p>
        <p className="tabular-nums">{formatCents(charge.amountCents, charge.currency)}</p>
      </div>
      <p className="text-xs text-muted-foreground">{chargeMetaLine(charge, allocations.length)}</p>
      {links.length === 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">
          No transaction is linked to this charge.
        </p>
      ) : (
        <ul aria-label="Transactions linked to this charge" className="mt-2 space-y-2">
          {links.map((link) => (
            <LinkLine key={link.id} link={link} currency={charge.currency} />
          ))}
        </ul>
      )}
    </li>
  );
}

function LinkLine({ link, currency }: { link: ChargeLink; currency: string }) {
  return (
    <li
      data-link-type={link.linkType}
      data-confirmed={link.confirmedAt !== null}
      className="rounded border border-dashed px-3 py-2 text-sm"
    >
      <p className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="tabular-nums">{formatCents(link.amountCents, currency)}</span>
        <span className="text-xs text-muted-foreground">
          {LINK_TYPE_LABELS[link.linkType]} · {confidenceLabel(link.confidence)} ·{' '}
          {linkStatusLabel(link)}
        </span>
      </p>
      <p className="truncate font-mono text-xs text-muted-foreground">{link.transactionUri}</p>
    </li>
  );
}
