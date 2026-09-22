import { createHash } from 'node:crypto';

const UUID_URL_NAMESPACE = '6ba7b8119dad11d180b400c04fd430c8';

interface SeedOptionIdentity {
  readonly id: string;
  readonly key: string;
  readonly label: string;
}

interface SeedFieldIdentity {
  readonly id: string;
  readonly key: string;
  readonly options: readonly SeedOptionIdentity[];
}

interface SeedTypeIdentity {
  readonly id: string;
  readonly key: string;
  readonly fields: readonly SeedFieldIdentity[];
}

function percentEncodedSegment(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/gu, (character) => {
    return `%${character.codePointAt(0)?.toString(16).toUpperCase().padStart(2, '0')}`;
  });
}

function uuidV5(name: string): string {
  const namespace = Buffer.from(UUID_URL_NAMESPACE, 'hex');
  const bytes = createHash('sha1').update(namespace).update(name, 'utf8').digest().subarray(0, 16);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x50;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function derivedOptionKey(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/gu, '_');
}

function validateOptionIdentities(
  typeKey: string,
  fieldKey: string,
  fieldName: string,
  options: readonly SeedOptionIdentity[]
): void {
  const optionKeys = new Set<string>();
  for (const option of options) {
    if (option.key !== derivedOptionKey(option.label) || optionKeys.has(option.key)) {
      throw new Error(`bootstrap field ${typeKey}.${fieldKey} has invalid option keys`);
    }
    optionKeys.add(option.key);
    const optionName = `${fieldName}/option/${percentEncodedSegment(option.key)}`;
    if (option.id !== uuidV5(optionName)) {
      throw new Error(`bootstrap option ${typeKey}.${fieldKey}.${option.key} has an invalid id`);
    }
  }
}

function validateFieldIdentity(typeKey: string, typeName: string, field: SeedFieldIdentity): void {
  const fieldName = `${typeName}/field/${percentEncodedSegment(field.key)}`;
  if (field.id !== uuidV5(fieldName)) {
    throw new Error(`bootstrap field ${typeKey}.${field.key} has an invalid id`);
  }
  validateOptionIdentities(typeKey, field.key, fieldName, field.options);
}

/** Validates every deterministic UUID and derived enum-option key in the bootstrap seed. */
export function validateSeedIdentities(catalogue: readonly SeedTypeIdentity[]): void {
  for (const type of catalogue) {
    const typeName = `pops://inventory/type/${percentEncodedSegment(type.key)}`;
    if (type.id !== uuidV5(typeName)) {
      throw new Error(`bootstrap type ${type.key} has an invalid id`);
    }
    for (const field of type.fields) validateFieldIdentity(type.key, typeName, field);
  }
}
