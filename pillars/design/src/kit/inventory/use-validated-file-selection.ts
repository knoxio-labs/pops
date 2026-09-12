/**
 * useValidatedFileSelection: shared file-picker validation for the inventory
 * upload widgets.
 *
 * Wraps `@pops/ui`'s catalog-backed `validateFiles`, translating each refusal
 * through `describeFileValidationError` and joining them into one line, the
 * shape both `PhotoUpload` and `DocumentUpload` rendered from their own
 * private, English-only `validateFiles` before POPS-2115.
 */
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { describeFileValidationError, validateFiles } from '@pops/ui';

export interface UseValidatedFileSelectionResult {
  handleFiles: (fileList: FileList | null) => void;
  validationError: string | null;
}

export function useValidatedFileSelection(
  accept: string,
  maxSizeMb: number,
  onFilesSelected: (files: File[]) => void
): UseValidatedFileSelectionResult {
  const { t, i18n } = useTranslation('ui');
  const [validationError, setValidationError] = useState<string | null>(null);

  const handleFiles = useCallback(
    (fileList: FileList | null) => {
      if (!fileList || fileList.length === 0) return;
      const errors: string[] = [];
      const valid = validateFiles({
        list: Array.from(fileList),
        accept,
        maxSize: maxSizeMb * 1024 * 1024,
        onError: (reason) => errors.push(describeFileValidationError(t, reason, i18n.language)),
      });
      setValidationError(errors.length > 0 ? errors.join(', ') : null);
      if (valid.length > 0) onFilesSelected(valid);
    },
    [accept, maxSizeMb, onFilesSelected, t, i18n.language]
  );

  return { handleFiles, validationError };
}
