import { type Currency } from '@/fixtures/currencies';
import { useState } from 'react';

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Select,
  TextInput,
} from '@pops/ui';

const CURRENCY_KIND_OPTIONS = [
  { value: 'fiat', label: 'Fiat' },
  { value: 'points', label: 'Points' },
];

export interface CurrencyCreateDialogProps {
  initialName: string;
  onCancel: () => void;
  onCreated: (currency: Currency) => void;
}

/**
 * The fields a rewards-points currency needs that a fiat one already has by
 * convention. A real `Dialog`, layered above the account form's own, so a
 * five-field form never has to fit inside a popover.
 */
export function CurrencyCreateDialog({
  initialName,
  onCancel,
  onCreated,
}: CurrencyCreateDialogProps) {
  const [code, setCode] = useState('');
  const [name, setName] = useState(initialName);
  const [symbol, setSymbol] = useState('');
  const [decimals, setDecimals] = useState('0');
  const [kind, setKind] = useState<Currency['kind']>('points');
  const [saving, setSaving] = useState(false);

  const submit = () => {
    setSaving(true);
    setTimeout(() => onCreated({ code, name, symbol, decimals: Number(decimals) || 0, kind }), 600);
  };

  return (
    <Dialog open onOpenChange={(next) => !next && onCancel()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>New currency</DialogTitle>
          <DialogDescription>Give it a code and a symbol, points included.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <TextInput
            label="Code"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
          />
          <TextInput label="Name" value={name} onChange={(e) => setName(e.target.value)} />
          <TextInput
            label="Symbol"
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
            placeholder="Blank for points"
          />
          <TextInput
            label="Decimals"
            type="number"
            value={decimals}
            onChange={(e) => setDecimals(e.target.value)}
          />
          <Select
            label="Kind"
            options={CURRENCY_KIND_OPTIONS}
            value={kind}
            onChange={(e) => setKind(e.target.value as Currency['kind'])}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
          <Button disabled={!code || saving} onClick={submit}>
            {saving ? 'Adding…' : 'Add currency'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
