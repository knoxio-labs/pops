import { failIssues, issue } from './authoring-shared.js';

export function requiredDefinitionValue(
  id: string,
  value: string | undefined,
  path: string,
  label: string
): string {
  if (value === undefined) {
    failIssues([issue(id, path, 'required', `${label} is required for a new definition`)]);
  }
  return value;
}

interface DefinitionTextInput {
  readonly id: string;
  readonly proposed: string | undefined;
  readonly current: string | undefined;
  readonly path: string;
  readonly label: string;
}

export function definitionText(input: DefinitionTextInput): string {
  if (input.proposed !== undefined) return input.proposed;
  if (input.current !== undefined) return input.current;
  return requiredDefinitionValue(input.id, input.proposed, input.path, input.label);
}

export function choose<T>(value: T | undefined, fallback: T): T {
  if (value === undefined) return fallback;
  return value;
}
