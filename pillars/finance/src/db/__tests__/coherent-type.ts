/**
 * A `type` that does not contradict `amountCents` (POPS-2685).
 *
 * Fixtures that only care about an amount used to omit `type` entirely and
 * take `createTransaction`'s `'purchase'` default, which is a contradiction on
 * a credit and is now refused at the write path. Nothing that uses this
 * depends on the value being `income` in particular — it is simply the neutral
 * positive type. A test that cares which type a row carries states its own,
 * and every such case still does.
 */
export function coherentType(amountCents: number): 'income' | 'purchase' {
  return amountCents > 0 ? 'income' : 'purchase';
}
