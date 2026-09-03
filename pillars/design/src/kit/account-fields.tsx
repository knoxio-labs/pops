import { type Account } from '@/fixtures/accounts';
import { CreateRow, InstitutionMark, PickerPopover, usePicker } from '@/kit/institution-select';
import { Check, Copy, Eye, EyeOff, Upload, X } from 'lucide-react';
import { type ReactNode, useState } from 'react';

import { CommandGroup, CommandItem, Label, TextInput } from '@pops/ui';

/**
 * Whoever sits on the other side of an account: the bank that holds it, the
 * person a ledger runs with, the merchant a stored-value card is spent at.
 */
export interface Counterparty {
  id: string;
  name: string;
  logo?: string;
  colour: string;
}

/** Contacts a person ledger can run with. */
export const contacts: Counterparty[] = [
  { id: 'p-marta', name: 'Marta Ferreira', colour: '#be123c' },
  { id: 'p-liam', name: 'Liam Connor', colour: '#0f766e' },
  { id: 'p-priya', name: 'Priya Raman', colour: '#7c3aed' },
];

/** Merchants a stored-value card can be spent at. */
export const merchants: Counterparty[] = [
  { id: 'e-ikea', name: 'IKEA', colour: '#0058a3' },
  { id: 'e-bunnings', name: 'Bunnings', colour: '#0d5257' },
  { id: 'e-coles', name: 'Coles', colour: '#e01a22' },
];

const MODES = {
  institution: { label: 'Institution', empty: 'No institution', noun: 'institutions' },
  person: { label: 'Person', empty: 'No contact', noun: 'contacts' },
  entity: { label: 'Redeemable at', empty: 'Anywhere', noun: 'merchants' },
} as const;

/** Which counterparty an account kind keeps, when it keeps one at all. */
export type CounterpartyMode = keyof typeof MODES;

export interface CounterpartySelectProps {
  mode: CounterpartyMode;
  options: Counterparty[];
  selected?: Counterparty;
  onSelect: (counterparty: Counterparty) => void;
  /** A search term that matches nothing offers this row; the caller mints the id. */
  onCreate: (name: string) => void;
  initialQuery?: string;
}

/**
 * The account's counterparty, labelled and sourced by the kind that owns it.
 * What a selection means beyond setting the id — a person's name becoming the
 * account's — is the caller's rule, not this picker's.
 */
export function CounterpartySelect({
  mode,
  options,
  selected,
  onSelect,
  onCreate,
  initialQuery,
}: CounterpartySelectProps) {
  const state = usePicker(initialQuery);
  const query = state.query.trim();
  const { label, empty, noun } = MODES[mode];
  const trigger = selected ? (
    <span className="flex items-center gap-2 truncate">
      <InstitutionMark institution={selected} />
      {selected.name}
    </span>
  ) : (
    <span className="text-muted-foreground">{empty}</span>
  );
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <PickerPopover
        ariaLabel={label}
        trigger={trigger}
        state={state}
        placeholder={`Search ${noun}...`}
        emptyMessage={`No ${noun} found.`}
      >
        <CommandGroup>
          {options.map((option) => (
            <CommandItem
              key={option.id}
              value={option.name}
              onSelect={() => {
                onSelect(option);
                state.close();
              }}
            >
              <InstitutionMark institution={option} />
              <span className="ml-2 truncate">{option.name}</span>
            </CommandItem>
          ))}
        </CommandGroup>
        {query && (
          <CreateRow
            label={query}
            onSelect={() => {
              onCreate(query);
              state.close();
            }}
          />
        )}
      </PickerPopover>
    </div>
  );
}

function IconButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button type="button" aria-label={label} onClick={onClick} className="text-muted-foreground">
      {children}
    </button>
  );
}

/**
 * A secret an account holds for the user — a gift card's number, its PIN.
 * Masked until revealed, and copyable, because a lost card is exactly when the
 * stored value has to be readable. The value is encrypted at rest and
 * decrypted only on an explicit reveal; which key does that is a backend
 * question this form does not answer.
 */
export function SecretField({ label, value }: { label: string; value?: string }) {
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
  if (!value) return <TextInput label={label} type="password" />;
  return (
    <TextInput
      label={label}
      readOnly
      value={revealed ? value : value.replace(/\S/gu, '•')}
      className="font-mono"
      suffix={
        <span className="flex items-center gap-2">
          <IconButton
            label={revealed ? `Hide ${label}` : `Reveal ${label}`}
            onClick={() => setRevealed(!revealed)}
          >
            {revealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </IconButton>
          <IconButton
            label={`Copy ${label}`}
            onClick={() => {
              void navigator.clipboard?.writeText(value);
              setCopied(true);
            }}
          >
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          </IconButton>
        </span>
      }
    />
  );
}

/**
 * The gift card's dates and the credentials it stores. What it shows for a
 * saved card is fictional, like every other value on this canvas.
 */
export function GiftCardSection({ account }: { account?: Account }) {
  return (
    <fieldset className="space-y-4 rounded-md border border-border p-4">
      <legend className="px-1 text-xs font-medium text-muted-foreground">Gift card</legend>
      <TextInput label="Expires" type="date" defaultValue={account?.expires ?? ''} />
      <SecretField label="Card number" value={account ? '6011 2394 8871 0042' : undefined} />
      <SecretField label="PIN" value={account ? '4417' : undefined} />
    </fieldset>
  );
}

/** The account's mark, large: an upload/replace/remove affordance over the current one. */
export function AvatarField({ mark }: { mark: ReactNode }) {
  const [image, setImage] = useState<string>();
  return (
    <div className="flex items-center gap-4">
      <span className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted">
        {image ? <img src={image} alt="" className="h-full w-full object-cover" /> : mark}
      </span>
      <div className="flex flex-col gap-1.5 text-sm">
        <label className="flex w-fit cursor-pointer items-center gap-1.5 text-primary">
          <Upload className="h-3.5 w-3.5" />
          {image ? 'Replace image' : 'Upload image'}
          <input
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(e) =>
              e.target.files?.[0] && setImage(URL.createObjectURL(e.target.files[0]))
            }
          />
        </label>
        {image ? (
          <button
            type="button"
            onClick={() => setImage(undefined)}
            className="flex w-fit items-center gap-1.5 text-muted-foreground"
          >
            <X className="h-3.5 w-3.5" /> Remove
          </button>
        ) : (
          <p className="text-xs text-muted-foreground">Optional.</p>
        )}
      </div>
    </div>
  );
}
