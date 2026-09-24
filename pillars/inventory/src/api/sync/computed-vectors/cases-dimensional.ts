import { FIELD, bin, cond, field, lit, read, root, un } from './fixture.js';

import type { PrimitiveKind } from '../../../catalogue/value-types.js';
import type { ExpressionVectorCase } from './fixture.js';

/** A box 20 cm × 30 cm × 400 mm weighing 3 kg, holding 1.5 L, turning at 3 rpm. */
export const box = [
  root(
    field(FIELD.width, { amount: '20', unit: 'cm' }),
    field(FIELD.height, { amount: '30', unit: 'cm' }),
    field(FIELD.depth, { amount: '400', unit: 'mm' }),
    field(FIELD.mass, { amount: '3', unit: 'kg' }),
    field(FIELD.capacity, { amount: '1.5', unit: 'L' }),
    field(FIELD.speed, { amount: '3', unit: 'rpm' })
  ),
];

/** Reads the box's width in cm. */
export const width = read(FIELD.width);
const height = read(FIELD.height);
const depth = read(FIELD.depth);
/** The box's width × height, in cm². */
export const area = bin('multiply', width, height);
const volume = bin('multiply', area, depth);

/** A measurement literal. */
export function m(amount: string, unit: string): unknown {
  return lit({ amount, unit });
}

/** A version-2 case over the box's dimensions. */
export function dimensional(
  name: string,
  expression: unknown,
  kind: PrimitiveKind,
  fixedUnit?: string
): ExpressionVectorCase {
  return {
    name,
    expressionVersion: 2,
    expression,
    kind,
    ...(fixedUnit === undefined ? {} : { fixedUnit }),
    items: box,
  };
}

/** Expression version 2: derived units, same-dimension conversion and their bounds. */
export const DIMENSIONAL_CASES: readonly ExpressionVectorCase[] = [
  dimensional('cm × cm is cm²', area, 'measurement', 'cm²'),
  dimensional('cm² × cm is cm³', bin('multiply', area, width), 'measurement', 'cm³'),
  dimensional('cm² × cm² is cm⁴', bin('multiply', area, area), 'measurement', 'cm⁴'),
  dimensional('width × height × depth supplies a volume in L', volume, 'measurement', 'L'),
  dimensional('a mixed-unit volume in cm³', volume, 'measurement', 'cm³'),
  dimensional('a mixed-unit volume in mm³', volume, 'measurement', 'mm³'),
  dimensional(
    'cm³ ÷ cm is cm²',
    bin('divide', bin('multiply', area, width), width),
    'measurement',
    'cm²'
  ),
  dimensional('cm ÷ mm is a plain number', bin('divide', width, depth), 'decimal'),
  dimensional('cm ÷ cm is a plain number', bin('divide', height, width), 'decimal'),
  dimensional(
    'L ÷ cm³ cancels to a plain number',
    bin('divide', read(FIELD.capacity), bin('multiply', area, width)),
    'decimal'
  ),
  dimensional(
    'kg ÷ L is kg/L',
    bin('divide', read(FIELD.mass), read(FIELD.capacity)),
    'measurement',
    'kg/L'
  ),
  dimensional(
    'kg ÷ L converts into kg/m³',
    bin('divide', read(FIELD.mass), read(FIELD.capacity)),
    'measurement',
    'kg/m³'
  ),
  dimensional(
    'an unknown unit squares',
    bin('multiply', read(FIELD.speed), read(FIELD.speed)),
    'measurement',
    'rpm²'
  ),
  dimensional(
    'a product matches a field unit written in another order',
    bin('multiply', read(FIELD.speed), width),
    'measurement',
    'cm·rpm'
  ),
  dimensional(
    'a measurement times a decimal keeps its unit',
    bin('multiply', width, lit('2')),
    'measurement',
    'cm'
  ),
  dimensional('negating a derived unit', un('negate', area), 'measurement', 'cm²'),
  dimensional('cm + mm adds in cm', bin('add', width, depth), 'measurement', 'cm'),
  dimensional('cm + mm into an mm field', bin('add', width, depth), 'measurement', 'mm'),
  dimensional('mm − cm subtracts in mm', bin('subtract', depth, width), 'measurement', 'mm'),
  dimensional('mm < cm compares converted amounts', bin('less_than', depth, width), 'boolean'),
  dimensional('20 cm equals 200 mm', bin('equal', width, m('200', 'mm')), 'boolean'),
  dimensional('20 cm equals 20.00 cm', bin('equal', width, m('20.00', 'cm')), 'boolean'),
  dimensional(
    'measurements of different dimensions are not equal',
    bin('equal', width, read(FIELD.mass)),
    'boolean'
  ),
  dimensional('a literal in m fills a cm field', m('1', 'm'), 'measurement', 'cm'),
  dimensional(
    'branches in different units convert into the field unit',
    cond(lit(true), m('1', 'm'), width),
    'measurement',
    'cm'
  ),
  dimensional('an area into a volume field is an evaluation error', area, 'measurement', 'L'),
  dimensional(
    'adding different dimensions is an evaluation error',
    bin('add', width, read(FIELD.mass)),
    'measurement',
    'cm'
  ),
  dimensional(
    'comparing different dimensions is an evaluation error',
    bin('less_than', width, read(FIELD.mass)),
    'boolean'
  ),
  dimensional(
    'a plain-number quotient into a measurement field is an evaluation error',
    bin('divide', height, width),
    'measurement',
    'cm'
  ),
  dimensional(
    'a unit that is not a unit term cannot multiply',
    bin('multiply', m('1', 'fl oz'), width),
    'measurement',
    'cm'
  ),
  dimensional(
    'identical non-term units still add',
    bin('add', m('1', 'fl oz'), m('2', 'fl oz')),
    'measurement',
    'fl oz'
  ),
  dimensional('a non-canonical unit is not the derived unit', area, 'measurement', 'cm2'),
];
