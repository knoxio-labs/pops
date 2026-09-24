import type { MeasurementWireValue, PrimitiveWireValue } from './value-types.js';

/** An exact arithmetic result or a bounded evaluation failure. */
export type ArithmeticResult =
  | { readonly state: 'value'; readonly value: PrimitiveWireValue }
  | {
      readonly state: 'error';
      readonly code:
        | 'invalid_value'
        | 'integer_overflow'
        | 'precision_overflow'
        | 'division_by_zero';
    };

interface DecimalParts {
  readonly coefficient: bigint;
  readonly scale: number;
}

const DECIMAL = /^(-?)(\d+)(?:\.(\d+))?$/u;

function parts(value: string): DecimalParts | null {
  const match = DECIMAL.exec(value);
  if (match === null) return null;
  const fraction = match[3] ?? '';
  const coefficient = BigInt(`${match[1] ?? ''}${match[2] ?? ''}${fraction}`);
  return { coefficient, scale: fraction.length };
}

function power(exponent: number): bigint {
  return 10n ** BigInt(exponent);
}

function decimalValue(value: DecimalParts): ArithmeticResult {
  const negative = value.coefficient < 0n;
  const digits = (negative ? -value.coefficient : value.coefficient)
    .toString()
    .padStart(value.scale + 1, '0');
  const whole = value.scale === 0 ? digits : digits.slice(0, -value.scale);
  const fraction = value.scale === 0 ? '' : `.${digits.slice(-value.scale)}`;
  const encoded = `${negative ? '-' : ''}${whole}${fraction}`;
  const significant = digits.replace(/^0+/u, '').length;
  if (value.scale > 9 || significant > 18) return { state: 'error', code: 'precision_overflow' };
  return { state: 'value', value: encoded };
}

function align(
  left: DecimalParts,
  right: DecimalParts
): { readonly left: bigint; readonly right: bigint; readonly scale: number } {
  const scale = Math.max(left.scale, right.scale);
  return {
    left: left.coefficient * power(scale - left.scale),
    right: right.coefficient * power(scale - right.scale),
    scale,
  };
}

function integer(value: number): ArithmeticResult {
  return Number.isSafeInteger(value)
    ? { state: 'value', value }
    : { state: 'error', code: 'integer_overflow' };
}

function measurement(value: PrimitiveWireValue): value is MeasurementWireValue {
  return typeof value === 'object' && 'amount' in value;
}

function decimals(
  left: PrimitiveWireValue,
  right: PrimitiveWireValue
): readonly [DecimalParts, DecimalParts] | null {
  if (typeof left !== 'string' || typeof right !== 'string') return null;
  const leftParts = parts(left);
  const rightParts = parts(right);
  return leftParts === null || rightParts === null ? null : [leftParts, rightParts];
}

/** Adds or subtracts identical numeric kinds without floating-point conversion. */
export function addOrSubtract(
  left: PrimitiveWireValue,
  right: PrimitiveWireValue,
  subtract: boolean
): ArithmeticResult {
  if (typeof left === 'number' && typeof right === 'number')
    return integer(subtract ? left - right : left + right);
  if (measurement(left) && measurement(right) && left.unit === right.unit) {
    const result = addOrSubtract(left.amount, right.amount, subtract);
    return result.state === 'value' && typeof result.value === 'string'
      ? { state: 'value', value: { amount: result.value, unit: left.unit } }
      : result;
  }
  const values = decimals(left, right);
  if (values === null) return { state: 'error', code: 'invalid_value' };
  const aligned = align(values[0], values[1]);
  return decimalValue({
    coefficient: subtract ? aligned.left - aligned.right : aligned.left + aligned.right,
    scale: aligned.scale,
  });
}

/** Multiplies identical scalar numerics or a fixed-unit measurement by a decimal. */
export function multiply(left: PrimitiveWireValue, right: PrimitiveWireValue): ArithmeticResult {
  if (typeof left === 'number' && typeof right === 'number') return integer(left * right);
  if (measurement(left) && typeof right === 'string') {
    const result = multiply(left.amount, right);
    return result.state === 'value' && typeof result.value === 'string'
      ? { state: 'value', value: { amount: result.value, unit: left.unit } }
      : result;
  }
  const values = decimals(left, right);
  if (values === null) return { state: 'error', code: 'invalid_value' };
  return decimalValue({
    coefficient: values[0].coefficient * values[1].coefficient,
    scale: values[0].scale + values[1].scale,
  });
}

function divideDecimals(left: DecimalParts, right: DecimalParts): ArithmeticResult {
  if (right.coefficient === 0n) return { state: 'error', code: 'division_by_zero' };
  const numerator = left.coefficient * power(right.scale);
  const denominator = right.coefficient * power(left.scale);
  for (let scale = 0; scale <= 9; scale += 1) {
    const scaled = numerator * power(scale);
    if (scaled % denominator === 0n)
      return decimalValue({ coefficient: scaled / denominator, scale });
  }
  return { state: 'error', code: 'precision_overflow' };
}

/** Divides exactly and rejects non-terminating or over-precision results. */
export function divide(left: PrimitiveWireValue, right: PrimitiveWireValue): ArithmeticResult {
  if (typeof left === 'number' && typeof right === 'number') {
    if (right === 0) return { state: 'error', code: 'division_by_zero' };
    return left % right === 0
      ? integer(left / right)
      : { state: 'error', code: 'precision_overflow' };
  }
  if (measurement(left) && typeof right === 'string') {
    const result = divide(left.amount, right);
    return result.state === 'value' && typeof result.value === 'string'
      ? { state: 'value', value: { amount: result.value, unit: left.unit } }
      : result;
  }
  const values = decimals(left, right);
  return values === null
    ? { state: 'error', code: 'invalid_value' }
    : divideDecimals(values[0], values[1]);
}

/**
 * Moves the decimal point of a decimal amount by `places`
 * (`amount × 10^places`), as a unit conversion does. A positive shift first
 * consumes fractional digits, so `1.5` shifted by 3 is `1500`; the result is
 * bounded like every other decimal (9 places, 18 significant digits).
 */
export function shiftDecimal(amount: string, places: number): ArithmeticResult {
  const value = parts(amount);
  if (value === null) return { state: 'error', code: 'invalid_value' };
  if (places < 0)
    return decimalValue({ coefficient: value.coefficient, scale: value.scale - places });
  const consumed = Math.min(value.scale, places);
  return decimalValue({
    coefficient: value.coefficient * power(places - consumed),
    scale: value.scale - consumed,
  });
}

/** Negates one integer, decimal or fixed-unit measurement. */
export function negate(value: PrimitiveWireValue): ArithmeticResult {
  if (typeof value === 'number') return integer(-value);
  if (measurement(value)) {
    const result = negate(value.amount);
    return result.state === 'value' && typeof result.value === 'string'
      ? { state: 'value', value: { amount: result.value, unit: value.unit } }
      : result;
  }
  if (typeof value !== 'string') return { state: 'error', code: 'invalid_value' };
  const valueParts = parts(value);
  return valueParts === null
    ? { state: 'error', code: 'invalid_value' }
    : decimalValue({ coefficient: -valueParts.coefficient, scale: valueParts.scale });
}

/** Compares identical numeric kinds without floating-point conversion. */
export function lessThan(left: PrimitiveWireValue, right: PrimitiveWireValue): boolean | null {
  if (typeof left === 'number' && typeof right === 'number') return left < right;
  if (measurement(left) && measurement(right) && left.unit === right.unit)
    return lessThan(left.amount, right.amount);
  const values = decimals(left, right);
  if (values === null) return null;
  const aligned = align(values[0], values[1]);
  return aligned.left < aligned.right;
}

/**
 * Whether two decimals are the same number at any scale (`3.0` and `3`,
 * `1.50` and `1.5`), compared exactly; null when either is not a decimal.
 */
export function decimalEqual(left: string, right: string): boolean | null {
  const values = decimals(left, right);
  if (values === null) return null;
  const aligned = align(values[0], values[1]);
  return aligned.left === aligned.right;
}
