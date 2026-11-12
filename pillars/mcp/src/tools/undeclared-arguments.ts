import type { ToolDef } from './tool-def.js';

/**
 * The top-level argument names a call passed that the tool's `inputSchema`
 * does not declare, when that schema sets `additionalProperties: false`.
 * Empty for a schema that allows extra keys.
 *
 * Handlers read only the keys they know, so without this check a misspelt
 * filter (`containerItemId` for `containingItemId`) is silently dropped and
 * the call answers as if no filter had been given.
 */
export function undeclaredArguments(
  schema: ToolDef['inputSchema'],
  args: Record<string, unknown>
): string[] {
  if (schema.additionalProperties !== false) return [];
  const declared = new Set(Object.keys(schema.properties ?? {}));
  return Object.keys(args).filter((key) => !declared.has(key));
}

/** The error text for a call that passed undeclared arguments. */
export function undeclaredArgumentsMessage(tool: ToolDef, undeclared: readonly string[]): string {
  const accepted = Object.keys(tool.inputSchema.properties ?? {});
  const acceptedText = accepted.length === 0 ? 'none' : accepted.join(', ');
  return `Unknown argument(s) for ${tool.name}: ${undeclared.join(', ')}. Accepted: ${acceptedText}.`;
}
