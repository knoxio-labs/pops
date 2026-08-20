import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button, formatDate, Select } from '@pops/ui';

import { ArmedAction } from './ArmedAction.js';
import { aliasIsAsserted } from './assertion.js';

import type { ReactElement } from 'react';

import type { DictionaryAlias, DictionaryEdit, DictionaryProduct } from './types.js';

interface AliasRowProps {
  alias: DictionaryAlias;
  /** Every product, so a wording can be pointed at one outside the filter. */
  allProducts: readonly DictionaryProduct[];
  currentProductId: string;
  /** What the product is called, for the controls that name what they take. */
  currentProductLabel: string;
  /** False where this wording is the only one its product holds. */
  canSplit: boolean;
  /** True where forgetting this wording also deletes a human-named product. */
  forgetEndsNamedProduct: boolean;
  isPending: boolean;
  onEdit: (edit: DictionaryEdit) => void;
}

/**
 * One printed wording, and every way of correcting it.
 *
 * The wording is the grain the dictionary learns at, so it is the grain the
 * corrections are offered at: a mapping stated once applies to every line that
 * ever prints it, past or future, and there is nothing per-line to fix.
 *
 * Both undo paths sit beside the paths they undo — `split` gives the wording a
 * product of its own again, `retract` returns the entry to a proposal —
 * because an undo a reader has to go looking for is one they will not find at
 * the moment they need it, which is the moment they realise the merge was
 * wrong.
 *
 * Split is offered only where the wording shares its product with another. A
 * wording alone on a product already is its own product, and a button that
 * minted a replacement and orphaned the original would be churn presented as a
 * correction.
 *
 * Forgetting is one click and stays one click, because a forgotten wording is
 * the recoverable case the rest of this row is: the next pass re-mints it from
 * the lines that print it, and re-mints the product with it where the product
 * was only ever wearing that wording. The one arrangement where it is not
 * recoverable is the last wording reaching a product a human named — the
 * product goes in the same write and the name is reconstructible from nothing
 * — and there the control asks twice, exactly as forgetting the product does.
 *
 * **Every control names the wording it acts on.** The visible label is the
 * verb, because the wording is right beside it; the accessible name carries
 * both, because a list of a hundred entries otherwise offers a hundred buttons
 * called "Assert" to anyone navigating by control rather than by eye.
 */
export function AliasRow({
  alias,
  allProducts,
  currentProductId,
  currentProductLabel,
  canSplit,
  forgetEndsNamedProduct,
  isPending,
  onEdit,
}: AliasRowProps): ReactElement {
  const { t } = useTranslation('purchases');
  const asserted = aliasIsAsserted(alias);
  const wording = alias.printedName;

  return (
    <li className="border-border space-y-2 rounded-md border p-3">
      <WordingSummary alias={alias} />

      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant={asserted ? 'outline' : 'default'}
          disabled={isPending}
          aria-label={t(asserted ? 'products.action.retractNamed' : 'products.action.assertNamed', {
            wording,
          })}
          onClick={() => onEdit({ kind: asserted ? 'retract' : 'assert', aliasId: alias.id })}
        >
          {t(asserted ? 'products.action.retract' : 'products.action.assert')}
        </Button>
        {canSplit && (
          <Button
            size="sm"
            variant="outline"
            disabled={isPending}
            aria-label={t('products.action.splitNamed', { wording })}
            onClick={() => onEdit({ kind: 'split', aliasId: alias.id })}
          >
            {t('products.action.split')}
          </Button>
        )}
        <ForgetWordingControl
          alias={alias}
          productLabel={currentProductLabel}
          endsNamedProduct={forgetEndsNamedProduct}
          isPending={isPending}
          onEdit={onEdit}
        />

        <MergeControl
          alias={alias}
          targets={allProducts.filter((product) => product.id !== currentProductId)}
          isPending={isPending}
          onEdit={onEdit}
        />
      </div>
    </li>
  );
}

interface ForgetWordingControlProps {
  alias: DictionaryAlias;
  productLabel: string;
  /** True where this wording is the last one holding a named product up. */
  endsNamedProduct: boolean;
  isPending: boolean;
  onEdit: (edit: DictionaryEdit) => void;
}

/**
 * Forgetting one wording, which is one click until it is not recoverable.
 *
 * The recoverable case is the ordinary one: the next pass re-mints the entry
 * from the lines that print it, and re-mints the product too where the product
 * was only ever wearing that wording. What no pass rebuilds is a name a human
 * typed, and the last wording reaching such a product is holding it up — the
 * product is deleted in the same write that forgets the wording. There the
 * control asks twice, exactly as forgetting the product does, and the second
 * button names the product it takes rather than asking whether the reader
 * means it.
 */
function ForgetWordingControl({
  alias,
  productLabel,
  endsNamedProduct,
  isPending,
  onEdit,
}: ForgetWordingControlProps): ReactElement {
  const { t } = useTranslation('purchases');
  const wording = alias.printedName;
  const arm = {
    text: t('products.action.forgetWording'),
    accessible: t('products.action.forgetWordingNamed', { wording }),
  };

  if (!endsNamedProduct) {
    return (
      <Button
        size="sm"
        variant="outline"
        disabled={isPending}
        aria-label={arm.accessible}
        onClick={() => onEdit({ kind: 'forgetWording', aliasId: alias.id })}
      >
        {arm.text}
      </Button>
    );
  }

  return (
    <ArmedAction
      arm={arm}
      confirm={{
        text: t('products.action.forgetWordingConfirm'),
        accessible: t('products.action.forgetWordingConfirmNamed', {
          wording,
          label: productLabel,
        }),
      }}
      cancel={{
        text: t('products.action.forgetWordingCancel'),
        accessible: t('products.action.forgetWordingCancelNamed', { wording }),
      }}
      isPending={isPending}
      onConfirm={() => onEdit({ kind: 'forgetWordingWithProduct', aliasId: alias.id })}
    />
  );
}

/**
 * What the entry says about itself: the wording as a till printed it, the key
 * it is looked up by, where it was printed, and who vouched for it.
 *
 * The printed and normalised forms are both shown because they are different
 * facts — the first is evidence, the second is what any two lines have to
 * agree on to group together — and a surface showing only one of them cannot
 * explain why two wordings that look alike did not merge.
 */
function WordingSummary({ alias }: { alias: DictionaryAlias }): ReactElement {
  const { t } = useTranslation('purchases');

  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <span className="font-mono text-sm">{alias.printedName}</span>
      <span className="text-muted-foreground text-xs">
        {t('products.alias.normalised', { name: alias.normalisedName })}
      </span>
      <span className="text-muted-foreground text-xs">
        {t('products.alias.source', { source: alias.source })}
      </span>
      <span
        className={
          alias.confirmedAt === null
            ? 'text-muted-foreground text-xs italic'
            : 'text-xs font-medium'
        }
      >
        {alias.confirmedAt === null
          ? t('products.alias.proposed')
          : t('products.alias.asserted', { at: formatDate(alias.confirmedAt) })}
      </span>
    </div>
  );
}

interface MergeControlProps {
  alias: DictionaryAlias;
  targets: readonly DictionaryProduct[];
  isPending: boolean;
  onEdit: (edit: DictionaryEdit) => void;
}

/**
 * The merge: pointing this wording at another product.
 *
 * Two steps rather than one, because this is the only correction that needs a
 * target and the target is the whole decision — the merge is the one thing on
 * this page that reaches across the scope a wording was learned in, and it
 * should not be a single mis-selected click away.
 *
 * The offer disappears when there is nothing to merge into: a dictionary
 * holding one product has no target, and a picker with no options is a control
 * that looks broken rather than one that says so.
 */
function MergeControl({
  alias,
  targets,
  isPending,
  onEdit,
}: MergeControlProps): ReactElement | null {
  const { t } = useTranslation('purchases');
  const [target, setTarget] = useState('');

  if (targets.length === 0) return null;

  return (
    <>
      <Select
        aria-label={t('products.action.mergeLabel', { wording: alias.printedName })}
        containerClassName="max-w-xs"
        value={target}
        placeholder={t('products.action.mergePlaceholder')}
        options={targets.map((product) => ({ value: product.id, label: product.label }))}
        onChange={(event) => setTarget(event.target.value)}
      />
      <Button
        size="sm"
        disabled={isPending || target === ''}
        aria-label={t('products.action.mergeNamed', { wording: alias.printedName })}
        onClick={() => onEdit({ kind: 'merge', aliasId: alias.id, productId: target })}
      >
        {t('products.action.merge')}
      </Button>
    </>
  );
}
