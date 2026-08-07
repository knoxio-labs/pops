/**
 * Reading printed money, from any receipt.
 *
 * Shared because two sources now depend on it and they see different
 * conventions: an Everyday Rewards payload prints `18.48` and `-4.95`,
 * while a photographed till slip prints `$18.48` and `-$4.95` — sign and
 * symbol in either order, which is why neither is stripped by position.
 *
 * Returns null rather than guessing. A receipt line that is not money is a
 * fact worth reporting; a silent zero is a shop that quietly costs less
 * than it did.
 */

/** `8.00`, `$8.00`, `-$4.95`, `$-4.95`, `1,495.00`. Null for anything else. */
export function parseAmountCents(raw: string | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;

  // Sign and currency symbol appear in both orders, so both are lifted off
  // wherever they sit rather than matched at a fixed position.
  const trimmed = raw.trim();
  const negative = trimmed.includes('-');
  const text = trimmed.replaceAll('-', '').replace(/^\$/u, '').trim();
  if (text === '') return null;
  if (!/^\d{1,3}(,\d{3})*(\.\d+)?$|^\d+(\.\d+)?$/u.test(text)) return null;

  const match = /^(\d[\d,]*)(?:\.(\d+))?$/u.exec(text);
  if (match === null) return null;
  const [, whole = '', fraction = ''] = match;
  const digits = `${fraction}000`.slice(0, 3);
  const rounded = Number(digits.slice(0, 2)) + (Number(digits.slice(2, 3)) >= 5 ? 1 : 0);
  const cents = Number(whole.replaceAll(',', '')) * 100 + rounded;
  if (!Number.isSafeInteger(cents)) return null;
  return negative ? -cents : cents;
}
