import { ARITHMETIC_CASES } from './cases-arithmetic.js';
import { LITERAL_CASES } from './cases-literals.js';
import { LOGIC_CASES } from './cases-logic.js';
import { READ_CASES } from './cases-reads.js';
import { OVERRIDE_CASES, STRUCTURE_CASES } from './cases-structure.js';

import type { ExpressionVectorCase } from './fixture.js';

/** Every case the shared expression vectors record, in file order. */
export const EXPRESSION_VECTOR_CASES: readonly ExpressionVectorCase[] = [
  ...LITERAL_CASES,
  ...READ_CASES,
  ...ARITHMETIC_CASES,
  ...LOGIC_CASES,
  ...STRUCTURE_CASES,
  ...OVERRIDE_CASES,
];
