import { Search } from 'lucide-react';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../primitives/dialog';
import { Skeleton } from '../primitives/skeleton';
import { TextInput } from './TextInput';

export interface SearchPickerDialogProps<T> {
  trigger: React.ReactElement;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  searchPlaceholder?: string;
  search: string;
  onSearchChange: (value: string) => void;
  isLoading: boolean;
  results: T[];
  renderResult: (item: T) => React.ReactNode;
  getResultKey: (item: T) => string | number;
  trailing?: React.ReactNode;
  minChars?: number;
  maxResultsHeight?: string;
  emptyMessage?: string;
}

interface ResultsBodyProps<T> {
  search: string;
  minChars: number;
  isLoading: boolean;
  results: T[];
  renderResult: (item: T) => React.ReactNode;
  getResultKey: (item: T) => string | number;
  emptyMessage: string;
}

function ResultsBody<T>({
  search,
  minChars,
  isLoading,
  results,
  renderResult,
  getResultKey,
  emptyMessage,
}: ResultsBodyProps<T>) {
  const { t } = useTranslation('ui');
  if (search.length < minChars) {
    return (
      <p className="text-sm text-muted-foreground py-4 text-center">
        {t('searchPicker.minChars', { count: minChars })}
      </p>
    );
  }
  if (isLoading) {
    return (
      <div className="space-y-2 py-2">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }
  if (results.length === 0) {
    return <p className="text-sm text-muted-foreground py-4 text-center">{emptyMessage}</p>;
  }
  return (
    <>
      {results.map((item) => (
        <React.Fragment key={getResultKey(item)}>{renderResult(item)}</React.Fragment>
      ))}
    </>
  );
}

export function SearchPickerDialog<T>({
  trigger,
  open,
  onOpenChange,
  title,
  description,
  searchPlaceholder,
  search,
  onSearchChange,
  isLoading,
  results,
  renderResult,
  getResultKey,
  trailing,
  minChars = 2,
  maxResultsHeight = 'max-h-64',
  emptyMessage,
}: SearchPickerDialogProps<T>) {
  const { t } = useTranslation('ui');
  const resolvedSearchPlaceholder = searchPlaceholder ?? t('searchPicker.searchPlaceholder');
  const resolvedEmptyMessage = emptyMessage ?? t('searchPicker.noResults');
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <div className={trailing ? 'flex items-center gap-2' : undefined}>
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <TextInput
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={resolvedSearchPlaceholder}
              className="pl-9"
              autoFocus
            />
          </div>
          {trailing}
        </div>
        <div className={`${maxResultsHeight} overflow-y-auto space-y-1`}>
          <ResultsBody
            search={search}
            minChars={minChars}
            isLoading={isLoading}
            results={results}
            renderResult={renderResult}
            getResultKey={getResultKey}
            emptyMessage={resolvedEmptyMessage}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
