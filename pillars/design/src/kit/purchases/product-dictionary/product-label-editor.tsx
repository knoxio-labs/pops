import { useState } from 'react';

import { Button, TextInput } from '@pops/ui';

import { ArmedAction } from './armed-action';

import type { DictionaryProduct } from '@/fixtures/purchases-dictionary';
import type { FormEvent, ReactElement } from 'react';

import type { DictionaryEdit } from './types';

interface ProductLabelEditorProps {
  product: DictionaryProduct;
  isPending: boolean;
  onEdit: (edit: DictionaryEdit) => void;
  /** Starts the forget-product control armed: a design state, not app behaviour. */
  startArmed?: boolean;
}

/**
 * The product's name, and the two writes that act on the product itself. A
 * proposal wears whichever till abbreviation minted it until somebody types
 * the real name, so renaming is the ordinary first correction rather than a
 * rare one, and it is offered inline.
 */
export function ProductLabelEditor({
  product,
  isPending,
  onEdit,
  startArmed = false,
}: ProductLabelEditorProps): ReactElement {
  const [draftLabel, setDraftLabel] = useState<string | null>(null);

  if (draftLabel !== null) {
    return (
      <RenameForm
        product={product}
        draftLabel={draftLabel}
        isPending={isPending}
        onDraft={setDraftLabel}
        onEdit={onEdit}
      />
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <h3 className="text-base font-medium">{product.label}</h3>
      <Button
        size="sm"
        variant="outline"
        disabled={isPending}
        aria-label={`Rename ${product.label}`}
        onClick={() => setDraftLabel(product.label)}
      >
        Rename
      </Button>
      <ForgetProductButtons
        product={product}
        isPending={isPending}
        onEdit={onEdit}
        startArmed={startArmed}
      />
    </div>
  );
}

interface RenameFormProps {
  product: DictionaryProduct;
  draftLabel: string;
  isPending: boolean;
  onDraft: (label: string | null) => void;
  onEdit: (edit: DictionaryEdit) => void;
}

/**
 * The rename leaves every wording alone, but typing a name records that a
 * human named the product, which puts it beyond the proposal pass's reach,
 * so it cannot be orphaned and swept away with a name nothing could
 * reconstruct. An empty name is refused rather than sent.
 */
function RenameForm({
  product,
  draftLabel,
  isPending,
  onDraft,
  onEdit,
}: RenameFormProps): ReactElement {
  function submit(event: FormEvent): void {
    event.preventDefault();
    const label = draftLabel.trim();
    if (label === '') return;
    onEdit({ kind: 'rename', productId: product.id, label });
    onDraft(null);
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-2">
      <TextInput
        aria-label={`New name for ${product.label}`}
        containerClassName="max-w-sm"
        value={draftLabel}
        onChange={(event) => onDraft(event.target.value)}
      />
      <Button size="sm" type="submit" disabled={isPending || draftLabel.trim() === ''}>
        Save
      </Button>
      <Button size="sm" variant="outline" type="button" onClick={() => onDraft(null)}>
        Cancel
      </Button>
    </form>
  );
}

interface ForgetProductButtonsProps {
  product: DictionaryProduct;
  isPending: boolean;
  onEdit: (edit: DictionaryEdit) => void;
  startArmed?: boolean;
}

/**
 * Forgetting a product asks twice: it takes every wording with it,
 * assertions included, and only re-running the pass afterwards restores the
 * proposals, without the decisions.
 */
function ForgetProductButtons({
  product,
  isPending,
  onEdit,
  startArmed = false,
}: ForgetProductButtonsProps): ReactElement {
  return (
    <ArmedAction
      arm={{ text: 'Forget this product', accessible: `Forget the product ${product.label}` }}
      confirm={{
        text: 'Forget it, and every wording',
        accessible: `Forget ${product.label} and every wording that reaches it`,
      }}
      cancel={{ text: 'Keep it', accessible: `Keep the product ${product.label}` }}
      isPending={isPending}
      onConfirm={() => onEdit({ kind: 'forgetProduct', productId: product.id })}
      startArmed={startArmed}
    />
  );
}
