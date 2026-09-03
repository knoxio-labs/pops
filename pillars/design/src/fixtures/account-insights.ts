/**
 * The per-account facts an account's dashboard needs beyond the record
 * itself — history to draw, terms to forecast from, a cycle to count down.
 *
 * None of this is in the finance contract yet; it is here so the modules can
 * be designed against something concrete rather than an empty state. Each
 * field is a claim about what the account page would need to be told.
 */
export interface BalancePoint {
  /** ISO month, `YYYY-MM`. */
  month: string;
  /** Minor units, signed in the account's own terms. */
  balance: number;
}

export interface LoanTerms {
  originalPrincipal: number;
  annualRatePct: number;
  termMonths: number;
  monthlyRepayment: number;
  startedOn: string;
}

export interface SavingsPlan {
  goalName: string;
  goal: number;
  monthlyContribution: number;
  annualRatePct: number;
}

export interface CardCycle {
  creditLimit: number;
  closesOn: string;
  dueOn: string;
  /** Spend so far this cycle, minor units. */
  cycleSpend: number;
  previousCycleSpend: number;
}

export interface PointsPlan {
  expiring: number;
  expiresOn: string;
  earnedLast90: number;
  /** Indicative worth of one point, in minor units of the reference currency. */
  centsPerPoint: number;
}

export interface AccountInsight {
  /**
   * Twelve months of balances, oldest first, signed the same way the
   * account's own balance is — a liability's series rises as more is owed.
   * A series that disagrees with its account's sign makes every trend on the
   * page read backwards.
   */
  history: BalancePoint[];
  loan?: LoanTerms;
  savings?: SavingsPlan;
  card?: CardCycle;
  points?: PointsPlan;
  /** Gift cards: what the card was worth when it was loaded. */
  originalValue?: number;
}

function series(start: number, step: number, jitter: number): BalancePoint[] {
  const months = [
    '2025-10',
    '2025-11',
    '2025-12',
    '2026-01',
    '2026-02',
    '2026-03',
    '2026-04',
    '2026-05',
    '2026-06',
    '2026-07',
    '2026-08',
    '2026-09',
  ];
  return months.map((month, i) => ({
    month,
    balance: Math.round(start + step * i + Math.sin(i * 1.7) * jitter),
  }));
}

export const insightsByAccountId: Record<string, AccountInsight> = {
  a1: { history: series(390_000, 3_200, 45_000) },
  a2: {
    history: series(180_000, 2_800, 30_000),
    card: {
      creditLimit: 1_500_000,
      closesOn: '2026-09-12',
      dueOn: '2026-10-03',
      cycleSpend: 84_310,
      previousCycleSpend: 231_905,
    },
  },
  a3: {
    history: series(62_000, -1_100, 12_000),
    card: {
      creditLimit: 600_000,
      closesOn: '2026-09-20',
      dueOn: '2026-10-14',
      cycleSpend: 18_400,
      previousCycleSpend: 51_200,
    },
  },
  a4: {
    history: series(2_400_000, 62_000, 40_000),
    savings: {
      goalName: 'House deposit',
      goal: 5_000_000,
      monthlyContribution: 65_000,
      annualRatePct: 4.35,
    },
  },
  a5: { history: series(12_000, -300, 4_000) },
  a6: { history: series(30_000, -1_400, 2_000), originalValue: 30_000 },
  a7: { history: series(2_000, -700, 3_000) },
  a8: { history: series(24_000, -250, 3_000) },
  a9: {
    history: series(120_000, 5_400, 8_000),
    points: {
      expiring: 24_000,
      expiresOn: '2026-12-31',
      earnedLast90: 38_600,
      centsPerPoint: 0.9,
    },
  },
  a11: {
    history: series(42_000_000, -310_000, 0),
    loan: {
      originalPrincipal: 52_000_000,
      annualRatePct: 5.89,
      termMonths: 360,
      monthlyRepayment: 308_400,
      startedOn: '2021-11-15',
    },
  },
};
