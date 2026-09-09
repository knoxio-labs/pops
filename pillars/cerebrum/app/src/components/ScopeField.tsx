/**
 * ScopeField — scope chip input on the ingest form's primary surface, with
 * autocomplete from known scopes and free-text entry for new ones.
 */
import { ChipInput } from '@pops/ui';

import { normalizeChipValue } from '../utils/normalizeChipValue';

interface ScopeFieldProps {
  value: string[];
  suggestions: { label: string; value: string }[];
  loading: boolean;
  onChange: (scopes: string[]) => void;
}

function getScopePlaceholder(loading: boolean, hasScopes: boolean): string {
  if (loading) return 'Loading scopes…';
  if (!hasScopes) return 'Add scopes (type or select)…';
  return 'Add more…';
}

export function ScopeField({ value, suggestions, loading, onChange }: ScopeFieldProps) {
  return (
    <div className="flex flex-col gap-1.5 w-full">
      <label className="text-xs font-semibold text-muted-foreground uppercase tracking-widest ml-1">
        Scopes
      </label>
      <ChipInput
        value={value}
        onChange={onChange}
        suggestions={suggestions}
        normalize={normalizeChipValue}
        placeholder={getScopePlaceholder(loading, value.length > 0)}
        disabled={loading}
        aria-label="Scope input"
      />
      {value.length === 0 && (
        <p className="text-xs text-muted-foreground ml-1">
          Leave empty to infer scopes automatically on submit.
        </p>
      )}
    </div>
  );
}
