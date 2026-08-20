import { isSameFile } from '../../../store/import-store-types';
import { describeAcceptedTypes, hasAcceptedExtension } from './accepted-types';

export interface AcceptArgs {
  incoming: File[];
  existing: File[];
  /** The drop zone's `accept` value, the single statement of what is allowed. */
  acceptedTypes: string;
  maxSizeBytes: number;
  maxSizeMB: number;
  maxTotalSizeBytes: number;
  maxTotalSizeMB: number;
}

export interface AcceptResult {
  accepted: File[];
  errors: string[];
}

/**
 * Additive selection: each drop or browse appends to what is already staged,
 * rejecting per file rather than discarding the whole batch on one bad member.
 */
export function acceptFiles(args: AcceptArgs): AcceptResult {
  const {
    incoming,
    existing,
    acceptedTypes,
    maxSizeBytes,
    maxSizeMB,
    maxTotalSizeBytes,
    maxTotalSizeMB,
  } = args;
  const accepted = [...existing];
  const errors: string[] = [];
  let total = existing.reduce((sum, f) => sum + f.size, 0);

  for (const file of incoming) {
    if (!hasAcceptedExtension(file.name, acceptedTypes)) {
      errors.push(`${file.name}: not a ${describeAcceptedTypes(acceptedTypes)} file.`);
      continue;
    }
    if (file.size > maxSizeBytes) {
      errors.push(`${file.name}: too large (maximum ${maxSizeMB}MB per file).`);
      continue;
    }
    if (accepted.some((f) => isSameFile(f, file))) {
      errors.push(`${file.name}: already added.`);
      continue;
    }
    if (total + file.size > maxTotalSizeBytes) {
      errors.push(`${file.name}: exceeds the ${maxTotalSizeMB}MB total upload limit.`);
      continue;
    }
    accepted.push(file);
    total += file.size;
  }

  return { accepted, errors };
}
