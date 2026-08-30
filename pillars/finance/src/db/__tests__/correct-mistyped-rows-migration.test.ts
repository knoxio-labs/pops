/**
 * Migration test for 0077_correct_mistyped_rows (POPS-2680).
 *
 * Seven rows whose `type` misrepresented what they were. Since POPS-2610 made
 * spend aggregations filter on `type`, each was a wrong number rather than a
 * cosmetic mislabel.
 *
 * The tables are pinned by hand rather than seeded through the journal, for the
 * same reason 0071's and 0073's tests do it: seeding through the journal would
 * hand the migration its own output.
 *
 * The cases that matter most are the controls. This migration is matched by id,
 * and the risk it carries is that someone later rewrites it as a match on the
 * description or on the amount sign — both of which look equivalent on this
 * data and would sweep correctly-typed rows on the next import. Every control
 * below is a row that such a rewrite would wrongly touch.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

/** The columns 0077 touches, as they stand when it runs. */
const PRE_MIGRATION_DDL = `
CREATE TABLE transactions (
  id text PRIMARY KEY NOT NULL,
  description text NOT NULL,
  amount_cents integer NOT NULL,
  type text DEFAULT 'purchase' NOT NULL,
  tags text DEFAULT '[]' NOT NULL
);
CREATE TABLE tag_vocabulary (
  tag text PRIMARY KEY NOT NULL,
  is_active integer DEFAULT 1 NOT NULL,
  usage_count integer DEFAULT 0 NOT NULL
);
`;

const REBATE = 'adc58397-b2e9-436c-8290-f91f076e0b63';
const REFUND_AMAZON = '71a7755a-0dd9-4a3b-8293-3cac48504b34';
const REFUND_BUNNINGS = '9e5c2053-0039-4959-991a-8db0e5b322aa';
const CARD_PAYMENT = 'fe71d44d-cf81-4703-bc20-3d95eac77ed2';
const VIRGIN_A = '47e162b1-b356-40a3-8554-f83c6f579618';
const VIRGIN_B = '3003e3e2-3ef0-4e57-abf5-c92af9b9df94';
const TICKETMASTER = '35b038bf-d143-48b6-a9e0-4144de98080e';

function migrationSql(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return readFileSync(
    join(here, '..', '..', '..', 'migrations', '0077_correct_mistyped_rows.sql'),
    'utf8'
  );
}

const MIGRATION = migrationSql();

let raw: Database.Database;

beforeEach(() => {
  raw = new Database(':memory:');
  raw.exec(PRE_MIGRATION_DDL);
});

afterEach(() => {
  raw.close();
});

function seed(
  id: string,
  description: string,
  amountCents: number,
  type: string,
  tags: readonly string[] = []
): void {
  raw
    .prepare(
      'INSERT INTO transactions (id, description, amount_cents, type, tags) VALUES (?, ?, ?, ?, ?)'
    )
    .run(id, description, amountCents, type, JSON.stringify(tags));
}

/** The seven rows as they stood before the migration. */
function seedAllTargets(): void {
  seed(REBATE, 'AMAZON MARKETPLACE AU', 500, 'purchase', ['enrich:amazon', 'channel:online']);
  seed(REFUND_AMAZON, 'AMAZON RETA* AMAZON AU', 2495, 'purchase', [
    'enrich:amazon',
    'channel:online',
  ]);
  seed(REFUND_BUNNINGS, 'BUNNINGS WAREHOUSE KINGSGROVE', 1000, 'purchase', [
    'enrich:bunnings',
    'occasion:home',
  ]);
  seed(CARD_PAYMENT, 'PAYMENT THANKYOU 754244', 50_000, 'purchase', ['flag:needs-review']);
  seed(VIRGIN_A, 'VIRGIN AUSTRALIA 994012 BAMAGA', -49, 'purchase', [
    'occasion:travel',
    'contains:fee',
    'flag:needs-review',
  ]);
  seed(VIRGIN_B, 'VIRGIN AUSTRALIA 994012 BAMAGA', -49, 'purchase', [
    'occasion:travel',
    'contains:fee',
    'flag:needs-review',
  ]);
  seed(TICKETMASTER, 'TM *TICKETMASTER MELBOURNE', -72, 'purchase', ['contains:events']);
}

function migrate(): void {
  raw.transaction(() => raw.exec(MIGRATION))();
}

function typeOf(id: string): string {
  return (raw.prepare('SELECT type FROM transactions WHERE id = ?').get(id) as { type: string })
    .type;
}

function tagsOf(id: string): string[] {
  const row = raw.prepare('SELECT tags FROM transactions WHERE id = ?').get(id) as {
    tags: string;
  };
  return JSON.parse(row.tags) as string[];
}

describe('0077 — the credits', () => {
  // Both types exist to separate a marketing credit from money back on returned
  // goods: `rebate` sits on the income tile and outside spend, `refund` stays
  // inside spend because it offsets what was spent at that merchant.
  it('types the Amex Offer Credit as a rebate, not a refund', () => {
    seedAllTargets();

    migrate();

    expect(typeOf(REBATE)).toBe('rebate');
  });

  it('types the two merchant credits as refunds', () => {
    seedAllTargets();

    migrate();

    expect(typeOf(REFUND_AMAZON)).toBe('refund');
    expect(typeOf(REFUND_BUNNINGS)).toBe('refund');
  });

  it('leaves their amounts alone — the sign was right and the type was wrong', () => {
    seedAllTargets();

    migrate();

    const amounts = raw
      .prepare('SELECT amount_cents FROM transactions WHERE id IN (?, ?, ?)')
      .all(REBATE, REFUND_AMAZON, REFUND_BUNNINGS) as { amount_cents: number }[];
    expect(amounts.map((r) => r.amount_cents).toSorted((a, b) => a - b)).toEqual([500, 1000, 2495]);
  });
});

describe('0077 — the card payment', () => {
  it('types it as a transfer, taking $500 out of the spend total', () => {
    seedAllTargets();

    migrate();

    expect(typeOf(CARD_PAYMENT)).toBe('transfer');
  });

  // The flag recorded that a decision was owed; the type change is that
  // decision, so leaving the flag would keep asking for one already made.
  it('clears the review flag it was carrying', () => {
    seedAllTargets();

    migrate();

    expect(tagsOf(CARD_PAYMENT)).toEqual([]);
  });
});

describe('0077 — the one descriptor match, and its limits', () => {
  // ANZ writes this on every monthly statement, so the sweep is deliberate: the
  // classifier gained the spelling in the same change, and a stored row must
  // end up with the type a freshly imported one would get.
  it('sweeps another card payment wearing the same descriptor', () => {
    seedAllTargets();
    seed('later-payment', 'PAYMENT THANKYOU 998877', 30_000, 'purchase');

    migrate();

    expect(typeOf('later-payment')).toBe('transfer');
  });

  it('is unbothered by the double spaces a statement export leaves in', () => {
    seedAllTargets();
    seed('spaced', 'PAYMENT  THANKYOU  112233', 10_000, 'purchase');

    migrate();

    expect(typeOf('spaced')).toBe('transfer');
  });

  // The sweep is scoped to rows still typed `purchase`, so it cannot overwrite
  // a type someone has already decided.
  it('does not rewrite a row wearing the descriptor that is already typed', () => {
    seedAllTargets();
    seed('already-income', 'PAYMENT THANKYOU 445566', 30_000, 'income');

    migrate();

    expect(typeOf('already-income')).toBe('income');
  });

  it('does not sweep a merchant whose name merely contains the word', () => {
    seedAllTargets();
    seed('cafe', 'THANKYOU CAFE SYDNEY', -1250, 'purchase');

    migrate();

    expect(typeOf('cafe')).toBe('purchase');
  });
});

describe('0077 — the surcharges', () => {
  it('types all three as fees', () => {
    seedAllTargets();

    migrate();

    expect(typeOf(VIRGIN_A)).toBe('fee');
    expect(typeOf(VIRGIN_B)).toBe('fee');
    expect(typeOf(TICKETMASTER)).toBe('fee');
  });

  // 0073 left `contains:fee` on these two deliberately, because the classifier
  // could not type them and the tag was the only evidence of what they were.
  // Typing them here is the event that was being waited for.
  it('replaces the stranded contains:fee with the fee: value that names the kind', () => {
    seedAllTargets();

    migrate();

    expect(tagsOf(VIRGIN_A)).toEqual(['occasion:travel', 'fee:surcharge']);
    expect(tagsOf(VIRGIN_B)).toEqual(['occasion:travel', 'fee:surcharge']);
  });

  // `contains:` says what a purchase contained, and a fee is not a purchase —
  // 0073's reasoning, applied to the row whose type just changed.
  it('drops the purchase-shaped contains: from the Ticketmaster row', () => {
    seedAllTargets();

    migrate();

    expect(tagsOf(TICKETMASTER)).toEqual(['fee:surcharge']);
  });

  it('recomputes the retired value usage count to zero once nothing wears it', () => {
    seedAllTargets();
    raw
      .prepare('INSERT INTO tag_vocabulary (tag, is_active, usage_count) VALUES (?, 0, 2)')
      .run('contains:fee');

    migrate();

    const row = raw
      .prepare('SELECT usage_count FROM tag_vocabulary WHERE tag = ?')
      .get('contains:fee') as { usage_count: number };
    expect(row.usage_count).toBe(0);
  });
});

describe('0077 — the controls a description or sign match would break', () => {
  // Every test here is a row that a "fix all the positive purchases" or "fix all
  // the Amazon credits" rewrite would wrongly sweep.
  it('leaves a different Amazon row alone, however similar its descriptor', () => {
    seedAllTargets();
    seed('other-amazon', 'AMAZON MARKETPLACE AU', -3599, 'purchase', ['enrich:amazon']);

    migrate();

    expect(typeOf('other-amazon')).toBe('purchase');
  });

  it('leaves another positive-amount purchase alone — the match is by id, not by sign', () => {
    seedAllTargets();
    seed('other-credit', 'SOME OTHER MERCHANT', 4200, 'purchase');

    migrate();

    expect(typeOf('other-credit')).toBe('purchase');
  });

  it('leaves another row carrying contains:fee alone', () => {
    seedAllTargets();
    seed('other-fee-tagged', 'SOMETHING ELSE', -1000, 'purchase', ['contains:fee']);

    migrate();

    expect(tagsOf('other-fee-tagged')).toEqual(['contains:fee']);
  });

  it('leaves another flagged row alone', () => {
    seedAllTargets();
    seed('other-flagged', 'STILL UNDECIDED', -1000, 'purchase', ['flag:needs-review']);

    migrate();

    expect(tagsOf('other-flagged')).toEqual(['flag:needs-review']);
  });

  it('leaves a legitimately-typed row of each target type alone', () => {
    seedAllTargets();
    seed('real-transfer', 'PAYID PAYMENT RECEIVED', 20_000, 'transfer');
    seed('real-fee', 'INTEREST CHARGE', -1500, 'fee', ['fee:interest']);

    migrate();

    expect(typeOf('real-transfer')).toBe('transfer');
    expect(typeOf('real-fee')).toBe('fee');
    expect(tagsOf('real-fee')).toEqual(['fee:interest']);
  });
});

describe('0077 — idempotence', () => {
  it('writes nothing on a second run', () => {
    seedAllTargets();

    migrate();
    const after = raw.prepare('SELECT id, type, tags FROM transactions ORDER BY id').all();
    migrate();

    expect(raw.prepare('SELECT id, type, tags FROM transactions ORDER BY id').all()).toEqual(after);
  });

  it('does not append a second fee:surcharge on a re-run', () => {
    seedAllTargets();

    migrate();
    migrate();

    expect(tagsOf(TICKETMASTER).filter((t) => t === 'fee:surcharge')).toHaveLength(1);
  });

  it('is a no-op on a ledger where none of the ids exist', () => {
    seed('unrelated', 'WOOLWORTHS', -5000, 'purchase', ['venue:supermarket']);

    migrate();

    expect(typeOf('unrelated')).toBe('purchase');
    expect(tagsOf('unrelated')).toEqual(['venue:supermarket']);
  });
});
