import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button, TextInput } from '@pops/ui';

import { ArmedAction } from './ArmedAction.js';

import type { FormEvent, ReactElement } from 'react';

import type { DictionaryEdit, DictionaryProduct } from './types.js';

interface ProductLabelEditorProps {
  product: DictionaryProduct;
  isPending: boolean;
  onEdit: (edit: DictionaryEdit) => void;
}

/**
 * The product's name, and the two writes that act on the product itself.
 *
 * A proposal wears whichever till abbreviation minted it until somebody types
 * the real name, so renaming is the ordinary first correction rather than a
 * rare one, and it is offered inline.
 */
export function ProductLabelEditor({
  product,
  isPending,
  onEdit,
}: ProductLabelEditorProps): ReactElement {
  const { t } = useTranslation('purchases');
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
        aria-label={t('products.action.renameNamed', { label: product.label })}
        onClick={() => setDraftLabel(product.label)}
      >
        {t('products.action.rename')}
      </Button>
      <ForgetProductButtons product={product} isPending={isPending} onEdit={onEdit} />
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
 * The rename, which leaves every wording alone: the aliases that resolve to
 * the product are untouched, so nothing about which lines group here changes.
 *
 * It is not only a relabelling, though. Typing a name records that a human
 * named the product, which puts the product beyond the proposal pass's reach
 * — the pass will no longer retire the wordings that reach it, so it cannot
 * be orphaned and swept away with a name nothing could reconstruct. Renaming
 * again restates the name; forgetting the product is the only way back.
 *
 * An empty name is refused rather than sent. The contract trims and requires
 * one character, so a blank submission would be a 400 the reader caused by
 * pressing a button that looked available.
 */
function RenameForm({
  product,
  draftLabel,
  isPending,
  onDraft,
  onEdit,
}: RenameFormProps): ReactElement {
  const { t } = useTranslation('purchases');

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
        aria-label={t('products.action.renameLabel', { label: product.label })}
        containerClassName="max-w-sm"
        value={draftLabel}
        onChange={(event) => onDraft(event.target.value)}
      />
      <Button size="sm" type="submit" disabled={isPending || draftLabel.trim() === ''}>
        {t('products.action.renameSave')}
      </Button>
      <Button size="sm" variant="outline" type="button" onClick={() => onDraft(null)}>
        {t('products.action.renameCancel')}
      </Button>
    </form>
  );
}

interface ForgetProductButtonsProps {
  product: DictionaryProduct;
  isPending: boolean;
  onEdit: (edit: DictionaryEdit) => void;
}

/**
 * Forgetting a product asks twice.
 *
 * Most corrections on this page are recoverable — the pass re-mints a
 * forgotten wording, a split undoes a merge — but this one takes every wording
 * with it, assertions included, and re-running the pass afterwards restores
 * the proposals without the decisions. A misclick that discards somebody's
 * work silently is what the second click is for.
 *
 * The same second click guards the one wording-level correction that reaches
 * this far: see `AliasRow`, where forgetting the last wording of a named
 * product deletes the product too.
 */
function ForgetProductButtons({
  product,
  isPending,
  onEdit,
}: ForgetProductButtonsProps): ReactElement {
  const { t } = useTranslation('purchases');

  return (
    <ArmedAction
      arm={{
        text: t('products.action.forgetProduct'),
        accessible: t('products.action.forgetProductNamed', { label: product.label }),
      }}
      confirm={{
        text: t('products.action.forgetProductConfirm'),
        accessible: t('products.action.forgetProductConfirmNamed', { label: product.label }),
      }}
      cancel={{
        text: t('products.action.forgetProductCancel'),
        accessible: t('products.action.forgetProductCancelNamed', { label: product.label }),
      }}
      isPending={isPending}
      onConfirm={() => onEdit({ kind: 'forgetProduct', productId: product.id })}
    />
  );
}
