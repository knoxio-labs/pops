import { useTranslation } from 'react-i18next';

/**
 * The column's heading, and the one place a failed lookup is reported.
 *
 * Every cell in this column draws nothing for a transaction no order explains,
 * which is most of a statement — so a failed lookup, which also draws nothing
 * anywhere, is indistinguishable from a genuine answer unless something says
 * otherwise. The something is here rather than on the rows: a marker per row
 * would be a marker on thousands of them for a fact that is true once, and the
 * heading is the only part of a column that renders exactly once.
 *
 * The short word is visible, so a sighted reader is not required to hover to
 * discover that the column is not answering, and the sentence behind it is the
 * `title` for a pointer.
 *
 * What assistive tech gets is composed as one string rather than assembled out
 * of the rendered pieces: the name of a heading is the concatenation of its
 * descendants with no separator inserted at an element boundary, so a label and
 * a caveat left to be joined by the DOM are announced run together. Hiding the
 * two visible pieces and stating the announced sentence once keeps what is read
 * out under this component's control instead of the layout's.
 *
 * Nothing here fails the page or displaces the heading: a sibling pillar being
 * down is not this page being broken, and the other columns are unaffected.
 */
export function PurchaseLinkHeader({ unavailable }: { unavailable: boolean }) {
  const { t } = useTranslation('finance');
  const label = t('column.purchase');
  if (!unavailable) return <>{label}</>;

  const caveat = t('transactions.purchaseLink.unavailableHint');
  return (
    <span className="flex items-center gap-1" title={caveat}>
      <span aria-hidden="true">{label}</span>
      <span aria-hidden="true" className="text-muted-foreground text-xs font-normal">
        {t('transactions.purchaseLink.unavailable')}
      </span>
      <span className="sr-only">{`${label} ${caveat}`}</span>
    </span>
  );
}
