import { knownUnitFactor } from './measurement-units.js';
import { Protocol1ValueError } from './protocol-1-types.js';

function expandExponentialDecimal(value: string): string {
  const match = /^(-?)(\d+)(?:\.(\d+))?[eE]([+-]?\d+)$/u.exec(value);
  if (!match) return value;
  const sign = match[1] ?? '';
  const whole = match[2] ?? '';
  const fraction = match[3] ?? '';
  const exponent = BigInt(match[4] ?? '0');
  const digits = `${whole}${fraction}`;
  const index = BigInt(whole.length) + exponent;
  if (index <= 0n) return `${sign}0.${'0'.repeat(Number(-index))}${digits}`;
  if (index >= BigInt(digits.length)) {
    return `${sign}${digits}${'0'.repeat(Number(index - BigInt(digits.length)))}`;
  }
  const offset = Number(index);
  return `${sign}${digits.slice(0, offset)}.${digits.slice(offset)}`;
}

function protocol1NumberToDecimal(fieldKey: string, value: unknown): string {
  if (typeof value !== 'number' || !Number.isFinite(value) || Object.is(value, -0)) {
    throw new Protocol1ValueError(fieldKey, 'measurement amounts must be finite numbers');
  }
  return expandExponentialDecimal(String(value));
}

function decimalParts(value: string): { negative: boolean; digits: bigint; scale: number } {
  const match = /^(-?)(\d+)(?:\.(\d+))?$/u.exec(value);
  if (!match) throw new Error('protocol-1 decimal conversion received an invalid decimal');
  const whole = match[2] ?? '';
  const fraction = match[3] ?? '';
  return {
    negative: match[1] === '-',
    digits: BigInt(`${whole}${fraction}`),
    scale: fraction.length,
  };
}

function formatDecimal(negative: boolean, digits: bigint, scale: number): string {
  if (digits === 0n) return '0';
  const raw = digits.toString().padStart(scale + 1, '0');
  const whole = raw.slice(0, raw.length - scale);
  const fraction = raw.slice(raw.length - scale).replace(/0+$/u, '');
  return `${negative ? '-' : ''}${whole}${fraction.length === 0 ? '' : `.${fraction}`}`;
}

/** Converts a protocol-1 measurement into the field's fixed unit without rounding. */
export function convertProtocol1MeasurementAmount(
  fieldKey: string,
  value: unknown,
  sourceSymbol: string,
  targetSymbol: string
): string {
  const factor = knownUnitFactor(sourceSymbol, targetSymbol);
  if (factor === null) {
    throw new Protocol1ValueError(fieldKey, `unit ${sourceSymbol} is incompatible`);
  }
  const decimal = decimalParts(protocol1NumberToDecimal(fieldKey, value));
  let numerator = decimal.digits * factor.numerator;
  let denominator = factor.denominator;
  let scale = decimal.scale;
  while (denominator % 10n === 0n) {
    denominator /= 10n;
    scale += 1;
  }
  if (denominator !== 1n || numerator % denominator !== 0n) {
    throw new Protocol1ValueError(fieldKey, 'unit conversion is not an exact decimal');
  }
  numerator /= denominator;
  return formatDecimal(decimal.negative, numerator, scale);
}
