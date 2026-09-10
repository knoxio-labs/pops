/**
 * Fictional budgets for the finance dashboard's "Active budgets" section,
 * shaped like the wire's budget rows: a category, a monthly amount and what
 * has been spent against it so far.
 */
export interface Budget {
  id: string;
  category: string;
  amount: number;
  spent: number;
  period: 'monthly';
  active: boolean;
}

export const budgets: Budget[] = [
  { id: 'b1', category: 'Groceries', amount: 900, spent: 612.4, period: 'monthly', active: true },
  { id: 'b2', category: 'Eating out', amount: 350, spent: 388.15, period: 'monthly', active: true },
  { id: 'b3', category: 'Transport', amount: 200, spent: 74.6, period: 'monthly', active: true },
];
