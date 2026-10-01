import { Search } from 'lucide-react';
import * as React from 'react';

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

/** Props for a modal that searches a bounded set of selectable results. */
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
  /** Localized guidance shown until the search reaches `minChars`. */
  minCharsMessage?: string;
  maxResultsHeight?: string;
  emptyMessage?: string;
}

interface ResultsBodyProps<T> {
  search: string;
  minChars: number;
  minCharsMessage: string;
  isLoading: boolean;
  results: T[];
  renderResult: (item: T) => React.ReactNode;
  getResultKey: (item: T) => string | number;
  emptyMessage: string;
}

function ResultsBody<T>({
  search,
  minChars,
  minCharsMessage,
  isLoading,
  results,
  renderResult,
  getResultKey,
  emptyMessage,
}: ResultsBodyProps<T>) {
  if (search.length < minChars) {
    return <p className="text-sm text-muted-foreground py-4 text-center">{minCharsMessage}</p>;
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

/** Renders a searchable dialog with localized loading, guidance and empty states. */
export function SearchPickerDialog<T>({
  trigger,
  open,
  onOpenChange,
  title,
  description,
  searchPlaceholder = 'Search...',
  search,
  onSearchChange,
  isLoading,
  results,
  renderResult,
  getResultKey,
  trailing,
  minChars = 2,
  minCharsMessage = `Type at least ${String(minChars)} characters to search`,
  maxResultsHeight = 'max-h-64',
  emptyMessage = 'No results found',
}: SearchPickerDialogProps<T>) {
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
              placeholder={searchPlaceholder}
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
            minCharsMessage={minCharsMessage}
            isLoading={isLoading}
            results={results}
            renderResult={renderResult}
            getResultKey={getResultKey}
            emptyMessage={emptyMessage}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
