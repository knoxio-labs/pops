import { ownerType, ROOT_PATH } from '@pops/inventory/expression';

import type { ExpressionContext } from '@pops/inventory/expression';

import type { InventoryApiIssue } from '../../inventory-api-helpers';

/** A server refusal placed on one node of the expression, phrased for the author. */
export interface ExpressionIssue {
  readonly path: string;
  readonly code: string;
  readonly title: string;
  readonly message: string;
  readonly cycle?: readonly string[];
}

const TITLES: Record<string, string> = {
  expression_type_mismatch: 'This does not fit here',
  expression_literal_type_mismatch: 'This value does not fit here',
  expression_literal_invalid: 'This value is not valid',
  literal_invalid: 'This value is not valid',
  expression_numeric_required: 'This needs a number',
  expression_text_required: 'Join needs text on both sides',
  expression_field_unknown: 'Field is not on every type this can reach',
  expression_type_unknown: 'A reference points at a type that is gone',
  expression_many_read: 'Fields holding many values cannot be read',
  expression_path_not_item_reference: 'This reference cannot be followed',
  reference_path_invalid: 'This reference cannot be followed',
  reference_hops_exceeded: 'Reads stop at two references',
  expression_nodes_exceeded: 'The expression is too large',
  expression_dependencies_exceeded: 'The expression reads too many fields',
  expression_arity_invalid: 'An operation is missing inputs',
  computed_many_forbidden: 'A computed field holds one value',
  expression_unit_unsupported: 'These units do not combine',
};

function sentence(message: string): string {
  const trimmed = message.replace(/^expression[.\w]*: /u, '').trim();
  const first = trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
  return first.endsWith('.') ? first : `${first}.`;
}

function fieldName(context: ExpressionContext, key: string): string {
  const [typeId, fieldId] = key.split(':');
  const type = context.types.find((candidate) => candidate.id === typeId);
  const field = type?.fields.find((candidate) => candidate.id === fieldId);
  if (type === undefined || field === undefined) return key;
  return `${type.label} › ${field.label}`;
}

function cycleChain(
  context: ExpressionContext,
  message: string,
  fieldLabel: string
): readonly string[] | undefined {
  const chain = /cycle: (.+)$/u.exec(message)?.[1]?.split(' -> ');
  if (chain === undefined || chain.length < 2) return undefined;
  return chain.map((key) => {
    const name = fieldName(context, key);
    return name === key && key.startsWith(`${context.ownerTypeId}:`)
      ? `${ownerType(context).label} › ${fieldLabel}`
      : name;
  });
}

function issueTitle(code: string, fieldLabel: string): string {
  if (code === 'expression_cycle') return `${fieldLabel} would read itself`;
  return TITLES[code] ?? 'The server refused this expression';
}

function isExpressionIssue(issue: InventoryApiIssue): boolean {
  return (
    issue.path.startsWith(ROOT_PATH) ||
    /^(expression|reference|literal|computed)_/u.test(issue.code)
  );
}

function concernsField(issue: InventoryApiIssue, fieldId: string | undefined): boolean {
  if (fieldId === undefined) return true;
  if (issue.definitionId === fieldId) return true;
  return (
    issue.definitionId === null &&
    issue.code === 'expression_cycle' &&
    issue.message.includes(fieldId)
  );
}

/**
 * The server's refusals for the field being edited, each placed on the node
 * its path names. Issues on other definitions are left to the rest of the
 * editor. A field that is new has no id yet, so every expression issue in a
 * batch that only carries its own operation is its own. A field-level issue
 * (its path is the field id) and a cycle land on the root.
 */
export function expressionIssues(
  issues: readonly InventoryApiIssue[],
  field: { readonly id: string | undefined; readonly label: string },
  context: ExpressionContext
): readonly ExpressionIssue[] {
  return issues
    .filter((issue) => isExpressionIssue(issue) && concernsField(issue, field.id))
    .map((issue) => {
      const cycle =
        issue.code === 'expression_cycle'
          ? cycleChain(context, issue.message, field.label)
          : undefined;
      return {
        path: issue.path.startsWith(ROOT_PATH) ? issue.path : ROOT_PATH,
        code: issue.code,
        title: issueTitle(issue.code, field.label),
        message: sentence(issue.message),
        ...(cycle === undefined ? {} : { cycle }),
      };
    });
}
