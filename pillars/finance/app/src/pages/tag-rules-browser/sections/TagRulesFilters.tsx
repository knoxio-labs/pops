import { Button, Select, type SelectOption, TextInput } from '@pops/ui';

const MATCH_TYPE_OPTIONS: SelectOption[] = [
  { value: '', label: 'All Match Types' },
  { value: 'exact', label: 'Exact' },
  { value: 'contains', label: 'Contains' },
  { value: 'regex', label: 'Regex' },
];

const STATUS_OPTIONS: SelectOption[] = [
  { value: '', label: 'All Statuses' },
  { value: 'true', label: 'Active' },
  { value: 'false', label: 'Disabled' },
];

type TagRulesFiltersProps = {
  matchType: string;
  isActive: string;
  minConfidence: string;
  onMatchTypeChange: (value: string) => void;
  onIsActiveChange: (value: string) => void;
  onMinConfidenceChange: (value: string) => void;
  onClear: () => void;
};

export function TagRulesFilters({
  matchType,
  isActive,
  minConfidence,
  onMatchTypeChange,
  onIsActiveChange,
  onMinConfidenceChange,
  onClear,
}: TagRulesFiltersProps) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <Select
        value={matchType}
        onChange={(e) => onMatchTypeChange(e.target.value)}
        options={MATCH_TYPE_OPTIONS}
        className="w-44"
      />
      <Select
        value={isActive}
        onChange={(e) => onIsActiveChange(e.target.value)}
        options={STATUS_OPTIONS}
        className="w-44"
      />
      <TextInput
        type="number"
        aria-label="Min confidence (0-1)"
        placeholder="Min confidence (0-1)"
        value={minConfidence}
        onChange={(e) => onMinConfidenceChange(e.target.value)}
        className="w-44"
        min={0}
        max={1}
        step={0.1}
      />
      {(matchType || isActive || minConfidence) && (
        <Button variant="ghost" size="sm" onClick={onClear}>
          Clear filters
        </Button>
      )}
    </div>
  );
}
