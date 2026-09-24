import {
  addOrSubtract,
  divide,
  lessThan,
  multiply,
  shiftDecimal,
  type ArithmeticResult,
} from './expression-arithmetic.js';
import {
  combineUnits,
  formatUnitTerm,
  termDimension,
  termPowerOfTen,
  unitConversionShift,
  type UnitTerm,
} from './measurement-units.js';

import type { MeasurementWireValue, PrimitiveWireValue } from './value-types.js';

/*
 * Expression version 2 arithmetic (Inventory ADR-002 D5): measurements of the
 * same dimension add, subtract and compare after converting the right operand
 * into the left one's unit, and measurements multiply and divide into derived
 * units. Anything that is not two measurements behaves as in version 1.
 */

type ArithmeticError = Extract<ArithmeticResult, { state: 'error' }>;

const INVALID: ArithmeticError = { state: 'error', code: 'invalid_value' };

function measurement(value: PrimitiveWireValue): value is MeasurementWireValue {
  return typeof value === 'object' && 'amount' in value;
}

/** `value`'s amount expressed in `unit`, or null when the dimensions differ. */
function amountIn(value: MeasurementWireValue, unit: string): string | ArithmeticError | null {
  const shift = unitConversionShift(value.unit, unit);
  if (shift === null) return null;
  const amount = shiftDecimal(value.amount, shift);
  if (amount.state === 'error') return amount;
  return typeof amount.value === 'string' ? amount.value : INVALID;
}

/** Adds or subtracts, converting a same-dimension right measurement first. */
export function dimensionalAddOrSubtract(
  left: PrimitiveWireValue,
  right: PrimitiveWireValue,
  subtract: boolean
): ArithmeticResult {
  if (!measurement(left) || !measurement(right)) return addOrSubtract(left, right, subtract);
  const amount = amountIn(right, left.unit);
  if (amount === null) return INVALID;
  if (typeof amount !== 'string') return amount;
  return addOrSubtract(left, { amount, unit: left.unit }, subtract);
}

/** Compares, converting a same-dimension right measurement first. */
export function dimensionalLessThan(
  left: PrimitiveWireValue,
  right: PrimitiveWireValue
): ArithmeticResult {
  let leftValue = left;
  let rightValue = right;
  if (measurement(left) && measurement(right)) {
    const amount = amountIn(right, left.unit);
    if (amount === null) return INVALID;
    if (typeof amount !== 'string') return amount;
    leftValue = left.amount;
    rightValue = amount;
  }
  const compared = lessThan(leftValue, rightValue);
  return compared === null ? INVALID : { state: 'value', value: compared };
}

/**
 * Whether two measurements are the same quantity: numerically equal once the
 * right is in the left's unit. Measurements of different dimensions are not
 * equal; a conversion that exceeds the decimal bounds is its error.
 */
export function dimensionalMeasurementEqual(
  left: MeasurementWireValue,
  right: MeasurementWireValue
): ArithmeticResult {
  const amount = amountIn(right, left.unit);
  if (amount === null) return { state: 'value', value: false };
  if (typeof amount !== 'string') return amount;
  const below = lessThan(left.amount, amount);
  const above = lessThan(amount, left.amount);
  return below === null || above === null ? INVALID : { state: 'value', value: !below && !above };
}

/**
 * Multiplies or divides. Two measurements combine their units: the right
 * amount is converted into the symbols it merges with, the amounts are
 * multiplied or divided exactly, and a result whose dimension cancels is a
 * plain decimal (cm ÷ mm is 10, L ÷ cm³ is 1000).
 */
export function dimensionalMultiplyOrDivide(
  left: PrimitiveWireValue,
  right: PrimitiveWireValue,
  quotient: boolean
): ArithmeticResult {
  if (!measurement(left) || !measurement(right))
    return quotient ? divide(left, right) : multiply(left, right);
  const combined = combineUnits(left.unit, right.unit, quotient ? -1 : 1);
  if (combined === null) return INVALID;
  const rightAmount = shiftDecimal(right.amount, combined.rightShift);
  if (rightAmount.state === 'error' || typeof rightAmount.value !== 'string') return rightAmount;
  const amount = quotient
    ? divide(left.amount, rightAmount.value)
    : multiply(left.amount, rightAmount.value);
  if (amount.state === 'error' || typeof amount.value !== 'string') return amount;
  return derived(amount.value, combined.term);
}

/** A product's amount in its combined unit: plain once every dimension cancels. */
function derived(amount: string, term: UnitTerm): ArithmeticResult {
  if (term.length === 0) return { state: 'value', value: amount };
  if (termDimension(term).size === 0) return shiftDecimal(amount, termPowerOfTen(term));
  return { state: 'value', value: { amount, unit: formatUnitTerm(term) } };
}

/**
 * Converts a version-2 result into the computed field's fixed unit, which
 * must measure the same dimension; any other value passes through.
 */
export function convertToFixedUnit(
  value: PrimitiveWireValue,
  fixedUnit: string | null
): ArithmeticResult {
  if (!measurement(value) || fixedUnit === null || value.unit === fixedUnit)
    return { state: 'value', value };
  const amount = amountIn(value, fixedUnit);
  if (amount === null) return INVALID;
  if (typeof amount !== 'string') return amount;
  return { state: 'value', value: { amount, unit: fixedUnit } };
}
