import { AlertCircle, AlertTriangle, CheckCircle } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle, Button, Label, PageHeader, Select } from '@pops/ui';

import { choiceOf } from './context';
import { ImportContextStrip } from './upload';

import type { ScreenMeta, ScreenStates } from '@/contract';

export const meta: ScreenMeta = { title: 'Map columns', order: 3, frame: 'web' };

const RAW_HEADERS = ['Date', 'Details', 'Amount', 'Suburb'];

const RAW_ROWS: Record<string, string>[] = [
  { Date: '24/08/2026', Details: 'AGL ELECTRICITY', Amount: '-142.50', Suburb: 'Docklands' },
  { Date: '24/08/2026', Details: 'WOOLWORTHS 4021', Amount: '-58.19', Suburb: 'South Yarra' },
  { Date: '25/08/2026', Details: 'NETFLIX.COM', Amount: '-16.99', Suburb: '' },
  { Date: '26/08/2026', Details: 'SALARY - KNOX IO', Amount: '3200.00', Suburb: '' },
  { Date: '27/08/2026', Details: 'BUNNINGS WAREHOUSE', Amount: '-84.32', Suburb: 'Richmond' },
  { Date: '28/08/2026', Details: 'MYKI TOPUP', Amount: '-40.00', Suburb: 'Melbourne' },
];

interface ColumnMap {
  date?: string;
  description?: string;
  amount?: string;
  location?: string;
}

const MAPPED: ColumnMap = {
  date: 'Date',
  description: 'Details',
  amount: 'Amount',
  location: 'Suburb',
};

const EMPTY: ColumnMap = {};
const NO_ERRORS: string[] = [];

const COLUMN_FIELDS: Array<{ key: keyof ColumnMap; label: string; required: boolean }> = [
  { key: 'date', label: 'Date', required: true },
  { key: 'description', label: 'Description', required: true },
  { key: 'amount', label: 'Amount', required: true },
  { key: 'location', label: 'Location (Town/City)', required: false },
];

function NoDetectionNotice() {
  return (
    <div className="rounded-lg border border-warning/25 bg-warning/10 p-4 text-sm text-warning">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
        <div className="flex-1 space-y-1">
          <p className="font-medium">No columns matched automatically</p>
          <p className="text-xs">
            None of this file&apos;s column names look like a date, description or amount, so
            nothing was filled in. An export with no header row is listed as Column 1, Column 2 and
            so on — check the bank you picked on the previous step, then map each field below.
          </p>
        </div>
      </div>
    </div>
  );
}

function ColumnMapFields({ headers, columnMap }: { headers: string[]; columnMap: ColumnMap }) {
  return (
    <div className="space-y-4">
      {COLUMN_FIELDS.map((field) => {
        const isInvalid = field.required && !columnMap[field.key];
        return (
          <div key={field.key} className="flex items-center gap-4">
            <Label className="w-40">
              {field.label}
              {field.required && <span className="ml-1 text-destructive">*</span>}
            </Label>
            <Select
              name={field.key}
              value={columnMap[field.key] ?? ''}
              onChange={() => {}}
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

function CellWithStatus({ value, ok }: { value: string | undefined; ok: boolean }) {
  return (
    <div className="flex items-center gap-2">
      {ok ? (
        <CheckCircle className="h-4 w-4 text-success" aria-hidden />
      ) : (
        <AlertCircle className="h-4 w-4 text-destructive" aria-hidden />
      )}
      <span className={ok ? '' : 'text-destructive'}>{value}</span>
    </div>
  );
}

function PreviewTable({
  rows,
  columnMap,
}: {
  rows: Record<string, string>[];
  columnMap: ColumnMap;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted">
            <tr>
              <th className="px-4 py-2 text-left font-medium">#</th>
              <th className="px-4 py-2 text-left font-medium">Date</th>
              <th className="px-4 py-2 text-left font-medium">Description</th>
              <th className="px-4 py-2 text-left font-medium">Amount</th>
              {columnMap.location && <th className="px-4 py-2 text-left font-medium">Location</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row, idx) => {
              const dateStr = row[columnMap.date ?? ''];
              const amountStr = row[columnMap.amount ?? ''];
              return (
                <tr key={`${row.Date ?? ''}-${row.Details ?? ''}`} className="hover:bg-muted">
                  <td className="px-4 py-2 text-muted-foreground">{idx + 1}</td>
                  <td className="px-4 py-2">
                    <CellWithStatus value={dateStr} ok={Boolean(dateStr)} />
                  </td>
                  <td className="px-4 py-2">{row[columnMap.description ?? '']}</td>
                  <td className="px-4 py-2">
                    <CellWithStatus value={amountStr} ok={Boolean(amountStr)} />
                  </td>
                  {columnMap.location && <td className="px-4 py-2">{row[columnMap.location]}</td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ValidationErrors({ errors }: { errors: string[] }) {
  if (errors.length === 0) return null;
  return (
    <Alert variant="destructive">
      <AlertCircle aria-hidden />
      <AlertTitle>Validation errors ({errors.length})</AlertTitle>
      <AlertDescription>
        <ul className="space-y-1">
          {errors.map((error) => (
            <li key={error}>• {error}</li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  );
}

function Step({
  columnMap = MAPPED,
  errors = NO_ERRORS,
  validating = false,
}: {
  columnMap?: ColumnMap;
  errors?: string[];
  validating?: boolean;
}) {
  const disabled = validating || !columnMap.date || !columnMap.description || !columnMap.amount;
  const previewRows = RAW_ROWS.slice(0, 10);
  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <PageHeader
        title="Map columns"
        description="Map CSV columns to transaction fields. Showing first 6 rows."
      />
      <ImportContextStrip choice={choiceOf('a2', 'amex-csv')} />
      {Object.keys(columnMap).length === 0 && <NoDetectionNotice />}
      <ColumnMapFields headers={RAW_HEADERS} columnMap={columnMap} />
      <PreviewTable rows={previewRows} columnMap={columnMap} />
      <ValidationErrors errors={errors} />
      <div className="flex justify-between gap-3">
        <Button variant="outline">Back</Button>
        <Button disabled={disabled}>{validating ? 'Processing...' : 'Next'}</Button>
      </div>
    </div>
  );
}

export default function ImportMapStep() {
  return <Step />;
}

export const states: ScreenStates = {
  'nothing-detected': () => <Step columnMap={EMPTY} />,
  validating: () => <Step validating />,
  'validation-errors': () => (
    <Step
      errors={[
        'Row 4: amount column is not a number',
        'Row 6: date column does not match a known date format',
      ]}
    />
  ),
  'missing-required': () => <Step columnMap={{ ...MAPPED, amount: undefined }} />,
};
