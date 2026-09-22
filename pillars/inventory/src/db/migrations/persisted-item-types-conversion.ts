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

function decimalParts(raw: string): { negative: boolean; digits: bigint; scale: number } {
  const value = expandExponentialDecimal(raw);
  const match = /^(-?)(0|[1-9][0-9]*)(?:\.([0-9]+))?$/.exec(value);
  if (!match) throw new Error('legacy measurement is not a canonical decimal');
  const [, sign, whole, fraction] = match;
  const digits = BigInt(`${whole}${fraction ?? ''}`);
  if (sign === '-' && digits === 0n) throw new Error('legacy measurement is negative zero');
  return { negative: sign === '-', digits, scale: (fraction ?? '').length };
}

function formatDecimal(negative: boolean, digits: bigint, scale: number): string {
  if (digits === 0n) return '0';
  const raw = digits.toString().padStart(scale + 1, '0');
  const whole = raw.slice(0, raw.length - scale);
  const fraction = raw.slice(raw.length - scale).replace(/0+$/, '');
  return `${negative ? '-' : ''}${whole}${fraction.length === 0 ? '' : `.${fraction}`}`;
}

function sourceUnitFactor(
  source: string,
  target: string
): { numerator: bigint; denominator: bigint } {
  if (source === target) return { numerator: 1n, denominator: 1n };
  const units: Record<string, { numerator: bigint; denominator: bigint }> = {
    mm: { numerator: 1n, denominator: 1000n },
    cm: { numerator: 1n, denominator: 100n },
    m: { numerator: 1n, denominator: 1n },
  };
  const from = units[source];
  const to = units[target];
  if (!from || !to) throw new Error('legacy measurement uses an incompatible unit');
  return {
    numerator: from.numerator * to.denominator,
    denominator: from.denominator * to.numerator,
  };
}

/** Converts one legacy measurement JSON object to exact canonical fixed-unit JSON. */
export function exactLegacyMeasurement(rawJson: string, fixedUnit: string): string {
  const amount = /"value":(-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?)(?:[,}])/.exec(
    rawJson
  )?.[1];
  const sourceUnit = /"unit":"([A-Za-z]+)"(?:[,}])/.exec(rawJson)?.[1];
  if (amount === undefined || sourceUnit === undefined) {
    throw new Error('legacy measurement has an invalid shape');
  }
  const source = decimalParts(amount);
  const factor = sourceUnitFactor(sourceUnit, fixedUnit);
  let numerator = source.digits * factor.numerator;
  let denominator = factor.denominator;
  let scale = source.scale;
  while (denominator % 10n === 0n) {
    denominator /= 10n;
    scale += 1;
  }
  if (denominator !== 1n || numerator % denominator !== 0n) {
    throw new Error('legacy unit conversion is not a terminating decimal');
  }
  numerator /= denominator;
  const canonical = formatDecimal(source.negative, numerator, scale);
  const unsigned = canonical.startsWith('-') ? canonical.slice(1) : canonical;
  const [whole, fraction = ''] = unsigned.split('.');
  const significantDigits = `${whole}${fraction}`.replace(/^0+/, '').length;
  if (significantDigits > 18 || fraction.length > 9) {
    throw new Error('legacy measurement exceeds persisted decimal precision');
  }
  return JSON.stringify({ amount: canonical, unit: fixedUnit });
}

/** Extracts and converts one endpoint of the sole legacy range value. */
export function exactLegacyRangePart(rawJson: string, part: 'low' | 'high'): string {
  const number = '-?(?:0|[1-9][0-9]*)(?:\\.[0-9]+)?(?:[eE][+-]?[0-9]+)?';
  const low = new RegExp(`"low":(${number})(?:[,}])`).exec(rawJson)?.[1];
  const high = new RegExp(`"high":(${number})(?:[,}])`).exec(rawJson)?.[1];
  const unit = /"unit":"([A-Za-z]+)"(?:[,}])/.exec(rawJson)?.[1];
  if (low === undefined || high === undefined || unit === undefined) {
    throw new Error('legacy range has an invalid shape');
  }
  return exactLegacyMeasurement(`{"value":${part === 'low' ? low : high},"unit":"${unit}"}`, unit);
}
