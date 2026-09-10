/**
 * Add-alias dialog.
 *
 * Composes the target picker with a single text input + source selector.
 * Source defaults to `user`. The submit button is disabled until both the
 * alias text is non-empty AND a target is picked.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  RadioInput,
} from '@pops/ui';

import { AliasTargetPicker } from './AliasTargetPicker';

import type { AliasSource, AliasTarget } from './types';

const ALIAS_SOURCES = ['user', 'llm', 'ingest'] as const satisfies readonly AliasSource[];

export interface AddAliasDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onSubmit: (input: { alias: string; target: AliasTarget; source: AliasSource }) => void;
  readonly isSubmitting?: boolean;
}

export function AddAliasDialog({
  open,
  onOpenChange,
  onSubmit,
  isSubmitting,
}: AddAliasDialogProps) {
  const { t } = useTranslation('food');
  const [alias, setAlias] = useState('');
  const [source, setSource] = useState<AliasSource>('user');
  const [target, setTarget] = useState<AliasTarget | null>(null);

  function resetAndClose(next: boolean): void {
    if (!next) {
      setAlias('');
      setSource('user');
      setTarget(null);
    }
    onOpenChange(next);
  }

  const submitDisabled = isSubmitting === true || alias.trim().length === 0 || target === null;

  function handleSubmit(): void {
    if (target === null) return;
    onSubmit({ alias: alias.trim(), target, source });
  }

  return (
    <Dialog open={open} onOpenChange={resetAndClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('data.aliases.add.title')}</DialogTitle>
          <DialogDescription>{t('data.aliases.add.description')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">{t('data.aliases.add.textLabel')}</span>
            <Input
              value={alias}
              onChange={(e) => setAlias(e.target.value)}
              placeholder={t('data.aliases.add.textPlaceholder')}
              aria-label={t('data.aliases.add.textLabel')}
            />
          </label>
          <fieldset className="space-y-1 text-sm">
            <legend className="font-medium">{t('data.aliases.add.targetLabel')}</legend>
            <AliasTargetPicker value={target} onChange={setTarget} />
          </fieldset>
          <SourceRadios value={source} onChange={setSource} />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => resetAndClose(false)}>
            {t('data.aliases.add.cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={submitDisabled}>
            {t('data.aliases.add.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SourceRadios({
  value,
  onChange,
}: {
  value: AliasSource;
  onChange: (next: AliasSource) => void;
}) {
  const { t } = useTranslation('food');
  return (
    <fieldset className="space-y-1 text-sm">
      <legend className="font-medium">{t('data.aliases.add.sourceLabel')}</legend>
      <RadioInput
        name="alias-source"
        orientation="horizontal"
        value={value}
        options={ALIAS_SOURCES.map((s) => ({ value: s, label: t(`data.aliases.source.${s}`) }))}
        onValueChange={(next) => onChange(next as AliasSource)}
      />
    </fieldset>
  );
}
