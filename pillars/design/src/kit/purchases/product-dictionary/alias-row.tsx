import { useState } from 'react';

import { Button, formatDate, Select } from '@pops/ui';

import { ArmedAction } from './armed-action';
import { aliasIsAsserted } from './assertion';

import type { DictionaryAlias, DictionaryProduct } from '@/fixtures/purchases-dictionary';
import type { ReactElement } from 'react';

import type { DictionaryEdit } from './types';

interface AliasRowProps {
  alias: DictionaryAlias;
  /** Every product, so a wording can be pointed at one outside the filter. */
  allProducts: readonly DictionaryProduct[];
  currentProductId: string;
  currentProductLabel: string;
  /** False where this wording is the only one its product holds. */
  canSplit: boolean;
  /** True where forgetting this wording also deletes a human-named product. */
  forgetEndsNamedProduct: boolean;
  isPending: boolean;
  onEdit: (edit: DictionaryEdit) => void;
}

/**
 * One printed wording, and every way of correcting it: the grain the
 * dictionary learns at, so the grain the corrections are offered at. A
 * mapping stated once applies to every line that ever printed it, past or
 * future, and there is nothing per-line to fix.
 *
 * Split is offered only where the wording shares its product with another:
 * a wording alone on a product already is its own product. Forgetting is one
 * click, except where it takes a human-named product with it, where it asks
 * twice like forgetting the product does.
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
  const asserted = aliasIsAsserted(alias);
  // Qualified by the product it sits under, because two products a merchant
  // prints identically hold the same wording: a control named for the wording
  // alone is indistinguishable from its twin to anyone navigating by control.
  const wording = `${alias.printedName} in ${currentProductLabel}`;

  return (
    <li className="border-border space-y-2 rounded-md border p-3">
      <WordingSummary alias={alias} />

      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant={asserted ? 'outline' : 'default'}
          disabled={isPending}
          aria-label={`${asserted ? 'Retract' : 'Assert'} ${wording}`}
          onClick={() => onEdit({ kind: asserted ? 'retract' : 'assert', aliasId: alias.id })}
        >
          {asserted ? 'Retract' : 'Assert'}
        </Button>
        {canSplit && (
          <Button
            size="sm"
            variant="outline"
            disabled={isPending}
            aria-label={`Give ${wording} its own product`}
            onClick={() => onEdit({ kind: 'split', aliasId: alias.id })}
          >
            Give it its own product
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
          currentProductLabel={currentProductLabel}
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
  endsNamedProduct: boolean;
  isPending: boolean;
  onEdit: (edit: DictionaryEdit) => void;
}

function ForgetWordingControl({
  alias,
  productLabel,
  endsNamedProduct,
  isPending,
  onEdit,
}: ForgetWordingControlProps): ReactElement {
  const wording = `${alias.printedName} in ${productLabel}`;

  if (!endsNamedProduct) {
    return (
      <Button
        size="sm"
        variant="outline"
        disabled={isPending}
        aria-label={`Forget the wording ${wording}`}
        onClick={() => onEdit({ kind: 'forgetWording', aliasId: alias.id })}
      >
        Forget this wording
      </Button>
    );
  }

  return (
    <ArmedAction
      arm={{ text: 'Forget this wording', accessible: `Forget the wording ${wording}` }}
      confirm={{
        text: 'Forget it, and the product with it',
        accessible: `Forget ${wording}, and the product ${productLabel} with it`,
      }}
      cancel={{ text: 'Keep it', accessible: `Keep the wording ${wording}` }}
      isPending={isPending}
      onConfirm={() => onEdit({ kind: 'forgetWordingWithProduct', aliasId: alias.id })}
    />
  );
}

/**
 * What the entry says about itself: the wording as a till printed it, the
 * key it is looked up by, where it was printed, and who vouched for it. The
 * printed and normalised forms are both shown because they are different
 * facts, and a surface showing only one cannot explain why two wordings that
 * look alike did not merge.
 */
function WordingSummary({ alias }: { alias: DictionaryAlias }): ReactElement {
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <span className="font-mono text-sm">{alias.printedName}</span>
      <span className="text-muted-foreground text-xs">matches on {alias.normalisedName}</span>
      <span className="text-muted-foreground text-xs">from {alias.source}</span>
      <span
        className={
          alias.confirmedAt === null
            ? 'text-muted-foreground text-xs italic'
            : 'text-xs font-medium'
        }
      >
        {alias.confirmedAt === null
          ? 'Proposed by the pass'
          : `Asserted ${formatDate(alias.confirmedAt)}`}
      </span>
    </div>
  );
}

interface MergeControlProps {
  alias: DictionaryAlias;
  /** The product the wording sits under today, which names the control. */
  currentProductLabel: string;
  targets: readonly DictionaryProduct[];
  isPending: boolean;
  onEdit: (edit: DictionaryEdit) => void;
}

/**
 * The merge: pointing this wording at another product. Two steps rather than
 * one, because the target is the whole decision: the only correction here
 * that reaches across the scope a wording was learned in. The offer
 * disappears when there is nothing to merge into.
 */
function MergeControl({
  alias,
  currentProductLabel,
  targets,
  isPending,
  onEdit,
}: MergeControlProps): ReactElement | null {
  const [target, setTarget] = useState('');

  if (targets.length === 0) return null;

  return (
    <>
      <Select
        aria-label={`Point “${alias.printedName}” in ${currentProductLabel} at another product`}
        containerClassName="max-w-xs"
        value={target}
        placeholder="Choose a product…"
        options={targets.map((product) => ({ value: product.id, label: product.label }))}
        onChange={(event) => setTarget(event.target.value)}
      />
      <Button
        size="sm"
        disabled={isPending || target === ''}
        aria-label={`Point ${alias.printedName} in ${currentProductLabel} at the chosen product`}
        onClick={() => onEdit({ kind: 'merge', aliasId: alias.id, productId: target })}
      >
        Point it there
      </Button>
    </>
  );
}
