/** Folds case and Unicode combining marks for accent-insensitive searches without changing locale behavior. */
export function normalizeSearchText(value: string): string {
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase();
}
