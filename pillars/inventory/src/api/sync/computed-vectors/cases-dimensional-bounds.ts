import { area, box, dimensional, m, width } from './cases-dimensional.js';
import { bin } from './fixture.js';

import type { ExpressionVectorCase } from './fixture.js';

/** Version 2's decimal bounds on conversion and derivation, and version 1 left as it was. */
export const DIMENSIONAL_BOUND_CASES: readonly ExpressionVectorCase[] = [
  dimensional(
    'a measurement divided by a zero measurement',
    bin('divide', width, m('0', 'cm')),
    'decimal'
  ),
  dimensional('a conversion at nine places', m('0.000001', 'mm'), 'measurement', 'm'),
  dimensional(
    'a conversion past nine places is precision_overflow',
    m('0.0000001', 'mm'),
    'measurement',
    'm'
  ),
  dimensional('a conversion at eighteen digits', m('999999999999999', 'm'), 'measurement', 'mm'),
  dimensional(
    'a conversion past eighteen digits is precision_overflow',
    m('9999999999999999', 'm'),
    'measurement',
    'mm'
  ),
  dimensional(
    'a zero amount converts and keeps the shifted scale',
    m('0', 'mm'),
    'measurement',
    'm'
  ),
  dimensional(
    'converting the right operand past nine places is precision_overflow',
    bin('multiply', m('1', 'm'), m('0.0000001', 'mm')),
    'measurement',
    'm²'
  ),
  dimensional(
    'a derived product past eighteen digits is precision_overflow',
    bin('multiply', m('999999999999', 'm'), m('9999999', 'm')),
    'measurement',
    'm²'
  ),
  dimensional(
    'a large power converts exactly when it fits',
    bin('multiply', bin('multiply', m('1', 'm'), m('1', 'm')), m('1', 'm')),
    'measurement',
    'mm³'
  ),
  dimensional(
    'a large power past eighteen digits is precision_overflow',
    bin(
      'multiply',
      bin(
        'multiply',
        bin('multiply', m('1', 'm'), m('1', 'm')),
        bin('multiply', m('1', 'm'), m('1', 'm'))
      ),
      bin('multiply', bin('multiply', m('1', 'm'), m('1', 'm')), m('1', 'm'))
    ),
    'measurement',
    'mm⁷'
  ),
  {
    name: 'version 1 still refuses measurement × measurement',
    expression: area,
    kind: 'measurement',
    fixedUnit: 'cm²',
    items: box,
  },
  {
    name: 'version 1 still refuses a result in another unit of the same dimension',
    expression: m('1', 'm'),
    kind: 'measurement',
    fixedUnit: 'cm',
  },
];
