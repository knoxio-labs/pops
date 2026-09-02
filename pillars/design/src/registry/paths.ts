import { parse as parseYaml } from 'yaml';

import type { ZodType } from 'zod';

/**
 * `import.meta.glob` keys are relative to the importing module
 * (`../screens/finance/import-review.tsx` from `registry/catalog.ts`). Strip
 * the leading `../` run so every path is `src`-relative, which is also the
 * form the synthetic keys in tests use.
 */
export function srcRelative(globPath: string): string {
  return globPath.replace(/^(\.\.\/)+/u, '');
}

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

/** Parse YAML and validate it, collecting a contract error instead of throwing. */
export function parseYamlFile<T>(
  raw: string,
  schema: ZodType<T>,
  path: string,
  errors: string[]
): T | null {
  let data: unknown;
  try {
    data = parseYaml(raw);
  } catch (error) {
    errors.push(
      `${path}: invalid YAML — ${error instanceof Error ? error.message : String(error)}`
    );
    return null;
  }
  const result = schema.safeParse(data);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('; ');
    errors.push(`${path}: ${issues}`);
    return null;
  }
  return result.data;
}
