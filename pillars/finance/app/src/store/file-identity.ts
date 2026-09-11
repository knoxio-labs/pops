/**
 * What a selected import file was, in the form a server draft can keep.
 *
 * The wizard compares live `File` handles to tell a re-selected batch from a
 * new one (`isSameFile` in `import-store-types.ts`). A resumed draft has no
 * handle — the file is never stored (finance ADR-005) — so this is the same
 * comparison over the identity the draft recorded instead (POPS-18).
 */

/**
 * The part of a selected file that survives a draft round-trip: exactly what
 * `isSameFile` compares, without the handle, which cannot be serialised.
 */
export interface SourceFileIdentity {
  name: string;
  size: number;
  lastModified: number;
}

export function fileIdentity(file: File): SourceFileIdentity {
  return { name: file.name, size: file.size, lastModified: file.lastModified };
}

/**
 * Whether `files` is the batch these identities were recorded from, position
 * by position — the same rule `isSameFileSet` applies to live handles,
 * for a resumed draft that has only the identities left.
 */
export function matchesFileIdentities(identities: SourceFileIdentity[], files: File[]): boolean {
  if (identities.length !== files.length) return false;
  return identities.every((identity, i) => {
    const file = files[i];
    return (
      file !== undefined &&
      identity.name === file.name &&
      identity.size === file.size &&
      identity.lastModified === file.lastModified
    );
  });
}
