import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Button, Label, Select as UiSelect } from '@pops/ui';

import { useImportStore } from '../../store/importStore';
import { autoDetectColumns, isEmptyColumnMap, type ColumnMap } from './column-map/parsers';
import { PreviewTable } from './column-map/PreviewTable';
import { validateAllRows } from './column-map/validation';

const COLUMN_FIELDS: Array<{ key: keyof ColumnMap; label: string; required: boolean }> = [
  { key: 'date', label: 'Date', required: true },
  { key: 'description', label: 'Description', required: true },
  { key: 'amount', label: 'Amount', required: true },
  { key: 'location', label: 'Location (Town/City)', required: false },
];

interface FieldsProps {
  headers: string[];
  localColumnMap: ColumnMap;
  onChange: (field: keyof ColumnMap, value: string) => void;
}

function ColumnMapFields({ headers, localColumnMap, onChange }: FieldsProps) {
  return (
    <div className="space-y-4">
      {COLUMN_FIELDS.map((field) => {
        const isInvalid = field.required && !localColumnMap[field.key];
        return (
          <div key={field.key} className="flex items-center gap-4">
            <Label className="w-40">
              {field.label}
              {field.required && <span className="text-destructive ml-1">*</span>}
            </Label>
            <UiSelect
              name={field.key}
              value={localColumnMap[field.key] ?? ''}
              onChange={(e) => onChange(field.key, e.target.value)}
              aria-invalid={isInvalid}
              placeholder="Select column..."
              options={headers.map((header) => ({ label: header, value: header }))}
              containerClassName="flex-1"
            />
          </div>
        );
      })}
    </div>
  );
}

function ValidationErrors({ errors }: { errors: string[] }) {
  if (errors.length === 0) return null;
  return (
    <div className="p-4 bg-destructive/5 border border-destructive/20 rounded-lg">
      <h3 className="text-sm font-semibold text-destructive mb-2">
        Validation Errors ({errors.length})
      </h3>
      <ul className="text-sm text-destructive space-y-1">
        {errors.map((error, idx) => (
          <li key={idx}>• {error}</li>
        ))}
      </ul>
    </div>
  );
}

function StepFooter({
  isValidating,
  disabled,
  onBack,
  onNext,
}: {
  isValidating: boolean;
  disabled: boolean;
  onBack: () => void;
  onNext: () => void;
}) {
  return (
    <div className="flex justify-between gap-3">
      <Button variant="outline" onClick={onBack}>
        Back
      </Button>
      <Button onClick={onNext} disabled={disabled}>
        {isValidating ? 'Processing...' : 'Next'}
      </Button>
    </div>
  );
}

/**
 * Auto-detects columns from `headers` and applies the result at most once
 * per mount, and only when nothing is mapped yet. UploadStep re-parses the
 * CSV (a brand-new `headers` array) on every Next click, and this step fully
 * unmounts/remounts on Back navigation, so re-running auto-detect on every
 * `headers` change would clobber a manual override the moment the user
 * clicks Back then Next without reselecting the file (#3621). Reading the
 * current values through refs (rather than depending on `headers`/
 * `columnMap` directly) also avoids looping forever when a header set has
 * nothing recognizable to detect, since `autoDetectColumns` would otherwise
 * keep returning a fresh-but-still-empty map on every re-run.
 */
function useAutoDetectColumnsOnce(
  headers: string[],
  columnMap: ColumnMap,
  setColumnMap: (columnMap: ColumnMap) => void,
  setLocalColumnMap: (columnMap: ColumnMap) => void
) {
  const headersRef = useRef(headers);
  headersRef.current = headers;
  const columnMapRef = useRef(columnMap);
  columnMapRef.current = columnMap;
  const hasAutoDetectedRef = useRef(false);
  useEffect(() => {
    if (hasAutoDetectedRef.current) return;
    hasAutoDetectedRef.current = true;
    if (!isEmptyColumnMap(columnMapRef.current)) return;
    const detected = autoDetectColumns(headersRef.current);
    setLocalColumnMap(detected);
    setColumnMap(detected);
  }, [setColumnMap, setLocalColumnMap]);
}

function useColumnMapState() {
  const {
    headers,
    rows,
    columnMap,
    bankType,
    setColumnMap,
    setParsedTransactions,
    nextStep,
    prevStep,
  } = useImportStore();
  const [localColumnMap, setLocalColumnMap] = useState(columnMap);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [isValidating, setIsValidating] = useState(false);

  useAutoDetectColumnsOnce(headers, columnMap, setColumnMap, setLocalColumnMap);

  const handleColumnChange = useCallback(
    (field: keyof ColumnMap, value: string) => {
      const updated = { ...localColumnMap, [field]: value };
      setLocalColumnMap(updated);
      setColumnMap(updated);
    },
    [localColumnMap, setColumnMap]
  );

  const handleNext = useCallback(() => {
    setIsValidating(true);
    setValidationErrors([]);
    setTimeout(() => {
      const validation = validateAllRows(rows, localColumnMap, bankType);
      if (!validation.valid) {
        setValidationErrors(validation.errors);
        setIsValidating(false);
        return;
      }
      setParsedTransactions(validation.parsedTransactions);
      setIsValidating(false);
      nextStep();
    }, 100);
  }, [rows, localColumnMap, bankType, setParsedTransactions, nextStep]);

  return {
    headers,
    rows,
    localColumnMap,
    validationErrors,
    isValidating,
    handleColumnChange,
    handleNext,
    prevStep,
  };
}

/**
 * Step 2: Map CSV columns to schema fields and validate parsing
 */
export function ColumnMapStep() {
  const s = useColumnMapState();
  const previewRows = useMemo(() => s.rows.slice(0, 10), [s.rows]);
  const disabled =
    s.isValidating ||
    !s.localColumnMap.date ||
    !s.localColumnMap.description ||
    !s.localColumnMap.amount;
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold mb-2">Map Columns</h2>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Map CSV columns to transaction fields. Showing first 10 rows.
        </p>
      </div>
      <ColumnMapFields
        headers={s.headers}
        localColumnMap={s.localColumnMap}
        onChange={s.handleColumnChange}
      />
      <PreviewTable rows={previewRows} columnMap={s.localColumnMap} />
      <ValidationErrors errors={s.validationErrors} />
      <StepFooter
        isValidating={s.isValidating}
        disabled={disabled}
        onBack={s.prevStep}
        onNext={s.handleNext}
      />
    </div>
  );
}
