import { formatBytes } from '../lib/format';

import type { TFunction } from 'i18next';

/**
 * Why a file was refused, carrying the data behind the refusal rather than a
 * rendered sentence — so a consumer can phrase its own copy from `file`,
 * `accept`, `maxSize` or `maxFiles` instead of parsing a string back apart.
 */
export type FileValidationErrorReason =
  | { readonly type: 'not-accepted'; readonly file: File; readonly accept: string }
  | { readonly type: 'too-large'; readonly file: File; readonly maxSize: number }
  | { readonly type: 'too-many'; readonly maxFiles: number; readonly attempted: number };

/** A validation refusal, with a localized default message alongside its reason. */
export type FileValidationError = FileValidationErrorReason & { readonly message: string };

export interface ValidateArgs {
  list: File[];
  accept?: string;
  maxSize?: number;
  maxFiles?: number;
  onError?: (reason: FileValidationErrorReason) => void;
}

function fileMatches(file: File, patterns: string[]): boolean {
  if (patterns.length === 0) return true;
  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();
  return patterns.some((p) => {
    const pat = p.toLowerCase();
    if (pat.startsWith('.')) return name.endsWith(pat);
    if (pat.endsWith('/*')) return type.startsWith(pat.slice(0, -1));
    return type === pat;
  });
}

export function validateFiles({ list, accept, maxSize, maxFiles, onError }: ValidateArgs): File[] {
  const patterns = accept
    ? accept
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean)
    : [];
  const out: File[] = [];
  for (const file of list) {
    if (accept && !fileMatches(file, patterns)) {
      onError?.({ type: 'not-accepted', file, accept });
      continue;
    }
    if (typeof maxSize === 'number' && file.size > maxSize) {
      onError?.({ type: 'too-large', file, maxSize });
      continue;
    }
    out.push(file);
  }
  if (typeof maxFiles === 'number' && out.length > maxFiles) {
    onError?.({ type: 'too-many', maxFiles, attempted: out.length });
    return out.slice(0, maxFiles);
  }
  return out;
}

/** The library's own phrasing of a {@link FileValidationErrorReason}, from the `ui` catalog. */
export function describeFileValidationError(
  t: TFunction<'ui'>,
  reason: FileValidationErrorReason
): string {
  switch (reason.type) {
    case 'not-accepted':
      return t('fileUpload.errors.notAccepted', { name: reason.file.name });
    case 'too-large':
      return t('fileUpload.errors.tooLarge', {
        name: reason.file.name,
        size: formatBytes(reason.maxSize),
      });
    case 'too-many':
      return t('fileUpload.errors.tooMany', { count: reason.maxFiles });
  }
}
