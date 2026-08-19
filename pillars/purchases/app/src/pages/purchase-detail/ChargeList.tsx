import { useTranslation } from 'react-i18next';

import { formatCents, formatDate } from '@pops/ui';

import type { ReactElement } from 'react';

import type { ChargeLink, PurchaseCharge } from './types.js';

/**
 * What was actually charged, and what each charge is linked to.
 *
 * A confirmed link and a proposed one are told apart here as they are in the
 * reconcile queue: a proposal is the engine's guess and survives only until
 * the next sweep disagrees, so rendering the two alike would present a guess
 * as a decision. The transaction is shown as its `pops://` URI because it
 * lives in another pillar and this app resolves nothing across that seam.
 */
export function ChargeList({ charges }: { charges: PurchaseCharge[] }): ReactElement {
  const { t } = useTranslation('purchases');

  if (charges.length === 0) {
    return <p className="text-muted-foreground text-sm">{t('purchase.charges.empty')}</p>;
  }

  return (
    <ul aria-label={t('purchase.charges.ariaLabel')} className="space-y-3">
      {charges.map((entry) => (
        <ChargeRow key={entry.charge.id} entry={entry} />
      ))}
    </ul>
  );
}

function ChargeRow({ entry }: { entry: PurchaseCharge }): ReactElement {
  const { t } = useTranslation('purchases');
  const { charge, links, allocations } = entry;

  return (
    <li data-charge-id={charge.id} data-charge-role={charge.role} className="rounded-md border p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-medium">
          {t(`purchase.charges.role.${charge.role}`)} ·{' '}
          {t(`purchase.charges.origin.${charge.origin}`)}
        </p>
        <p className="tabular-nums">{formatCents(charge.amountCents, charge.currency)}</p>
      </div>

      <p className="text-muted-foreground text-xs">
        {charge.chargedAt === null
          ? t('purchase.charges.notCharged')
          : formatDate(charge.chargedAt)}
        {charge.paymentHint !== null && ` · ${charge.paymentHint}`}
        {' · '}
        {t('purchase.charges.allocations', { count: allocations.length })}
      </p>

      {links.length === 0 ? (
        <p className="text-muted-foreground mt-2 text-xs">{t('purchase.charges.noLinks')}</p>
      ) : (
        <ul aria-label={t('purchase.charges.linksLabel')} className="mt-2 space-y-2">
          {links.map((link) => (
            <LinkLine key={link.id} link={link} currency={charge.currency} />
          ))}
        </ul>
      )}
    </li>
  );
}

function LinkLine({ link, currency }: { link: ChargeLink; currency: string }): ReactElement {
  const { t } = useTranslation('purchases');

  return (
    <li
      data-link-type={link.linkType}
      data-confirmed={link.confirmedAt !== null}
      className="rounded border border-dashed px-3 py-2 text-sm"
    >
      <p className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="tabular-nums">{formatCents(link.amountCents, currency)}</span>
        <span className="text-muted-foreground text-xs">
          {t(`purchase.charges.linkType.${link.linkType}`)} ·{' '}
          {t('purchase.charges.confidence', { percent: Math.round(link.confidence * 100) })} ·{' '}
          {link.confirmedAt === null
            ? t('purchase.charges.proposed')
            : t('purchase.charges.confirmed')}
        </span>
      </p>
      <p className="text-muted-foreground truncate font-mono text-xs">{link.transactionUri}</p>
    </li>
  );
}
