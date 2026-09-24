import { fromJSONSchema, type core } from 'zod';

import type { MockHandlers, MockRequest } from './install.js';
import type { OperationKey } from './router.js';

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const COMPONENT_SCHEMA_REF = '#/components/schemas/';

function pointerSegment(segment: string): string {
  return segment.replaceAll('~', '~0').replaceAll('/', '~1');
}

function pointer(...segments: readonly string[]): string {
  return `#/${segments.map(pointerSegment).join('/')}`;
}

function resolvePointer(document: unknown, ref: string): unknown {
  if (!ref.startsWith('#/')) return undefined;
  let node: unknown = document;
  for (const raw of ref.slice(2).split('/')) {
    const segment = raw.replaceAll('~1', '/').replaceAll('~0', '~');
    if (!isRecord(node)) return undefined;
    node = node[segment];
  }
  return node;
}

/**
 * `fromJSONSchema` resolves local refs only into the root's `definitions`
 * (or `$defs`), so the document's `#/components/schemas/*` refs are re-pointed
 * there and the components ride along as the root's `definitions`.
 */
function rewriteComponentRefs(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(rewriteComponentRefs);
  if (!isRecord(node)) return node;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node)) {
    out[key] =
      key === '$ref' && typeof value === 'string' && value.startsWith(COMPONENT_SCHEMA_REF)
        ? `#/definitions/${value.slice(COMPONENT_SCHEMA_REF.length)}`
        : rewriteComponentRefs(value);
  }
  return out;
}

function componentSchemas(
  document: Readonly<Record<string, unknown>>
): Readonly<Record<string, unknown>> {
  const components = document['components'];
  return isRecord(components) && isRecord(components['schemas']) ? components['schemas'] : {};
}

/**
 * The response schema as a standalone JSON Schema: a root `$ref` to it,
 * filed beside the document's components under `definitions`.
 */
function standaloneSchema(
  document: Readonly<Record<string, unknown>>,
  schema: unknown
): { $ref: string; definitions: unknown } {
  const components = componentSchemas(document);
  let name = 'response';
  while (name in components) name = `_${name}`;
  return {
    $ref: `#/definitions/${name}`,
    definitions: rewriteComponentRefs({ ...components, [name]: schema }),
  };
}

/** A request the check hands a handler in place of the synthesized default. */
export type SampleRequest = Partial<Omit<MockRequest, 'method'>>;

/** How one handler's answer lines up against the response its operation declares. */
export interface ResponseConformance {
  readonly operation: OperationKey;
  /** The operation's `operationId`, when the document gives one. */
  readonly operationId: string | undefined;
  /** The status the handler answered with. */
  readonly status: number;
  /**
   * JSON pointer into the document to the schema the body was validated
   * against, or `null` when nothing was validated: the answered status
   * declares no JSON body or cannot carry one, or is not declared at all.
   */
  readonly schemaPath: string | null;
  /** `<instance path>: <message>` per violation. Empty means the body conforms. */
  readonly issues: readonly string[];
}

function sampleRequest(key: OperationKey, sample: SampleRequest | undefined): MockRequest {
  const [method = 'GET', template = '/'] = key.split(' ');
  const params: Record<string, string> = {};
  for (const [, name = ''] of template.matchAll(/\{([^}]+)\}/g)) params[name] = name;
  Object.assign(params, sample?.params);
  const path = template.replaceAll(/\{([^}]+)\}/g, (_match, name: string) =>
    encodeURIComponent(params[name] ?? name)
  );
  return {
    method,
    path: sample?.path ?? path,
    params,
    query: sample?.query ?? new URLSearchParams(),
    body: sample?.body,
  };
}

function formatPath(path: readonly PropertyKey[]): string {
  return path.length === 0 ? '(root)' : path.map(String).join('.');
}

/**
 * How far a union branch is from the body: a branch whose own literal (a
 * `kind` discriminator) the body contradicts is further than any branch whose
 * literals it matches, however many fields that branch is missing.
 */
function branchDistance(branch: readonly core.$ZodIssue[]): number {
  const contradictsLiteral = branch.some(
    (issue) => issue.code === 'invalid_value' && issue.path.length === 1
  );
  return (contradictsLiteral ? 1_000_000 : 0) + branch.length;
}

/**
 * A union failure on its own reads `(root): Invalid input`, which names no
 * field. Report the branch that came closest instead, with its paths rebased
 * onto the union's.
 */
function describeIssues(
  issues: readonly core.$ZodIssue[],
  base: readonly PropertyKey[] = []
): string[] {
  return issues.flatMap((issue) => {
    const path = [...base, ...issue.path];
    if (issue.code === 'invalid_union' && issue.errors.length > 0) {
      const closest = issue.errors.reduce((best, branch) =>
        branchDistance(branch) < branchDistance(best) ? branch : best
      );
      if (closest.length > 0) return describeIssues(closest, path);
    }
    return [`${formatPath(path)}: ${issue.message}`];
  });
}

/** Statuses whose response cannot carry a body: `new Response` refuses one. */
const NULL_BODY_STATUSES = new Set([101, 204, 205, 304]);

type BodyCheck = { schemaPath: string | null; issues: string[] };

interface AnsweredOperation {
  readonly document: Readonly<Record<string, unknown>>;
  readonly operation: Readonly<Record<string, unknown>>;
  /** Pointer segments to the operation object, e.g. `['paths', '/x', 'get']`. */
  readonly at: readonly string[];
  readonly status: number;
  readonly body: unknown;
}

/** The declared response for `status` (or `default`), with a response-level `$ref` followed. */
function declaredResponse(
  answered: AnsweredOperation
): { statusKey: string; response: unknown } | undefined {
  const { document, operation, status } = answered;
  const responses = isRecord(operation['responses']) ? operation['responses'] : {};
  const statusKey = String(status) in responses ? String(status) : 'default';
  const response = responses[statusKey];
  if (response === undefined) return undefined;
  const resolved =
    isRecord(response) && typeof response['$ref'] === 'string'
      ? resolvePointer(document, response['$ref'])
      : response;
  return { statusKey, response: resolved };
}

/** A response with no JSON schema: nothing to validate, unless it declares no content at all and got some. */
function withoutJsonSchema(status: number, body: unknown, content: object): BodyCheck {
  const unexpectedBody = body !== undefined && Object.keys(content).length === 0;
  return {
    schemaPath: null,
    issues: unexpectedBody
      ? [`status ${status} declares no body, but the handler answered one`]
      : [],
  };
}

function checkBody(answered: AnsweredOperation): BodyCheck {
  const { document, at, status, body } = answered;
  const declared = declaredResponse(answered);
  if (declared === undefined) {
    return { schemaPath: null, issues: [`status ${status} is not declared by the operation`] };
  }
  if (NULL_BODY_STATUSES.has(status)) {
    const issues =
      body === undefined
        ? []
        : [`status ${status} cannot carry a body, but the handler answered one`];
    return { schemaPath: null, issues };
  }
  const { response, statusKey } = declared;
  const content = isRecord(response) && isRecord(response['content']) ? response['content'] : {};
  const json = content['application/json'];
  if (!isRecord(json) || json['schema'] === undefined)
    return withoutJsonSchema(status, body, content);

  const schema = fromJSONSchema(standaloneSchema(document, json['schema']), {
    defaultTarget: 'openapi-3.0',
  });
  const result = schema.safeParse(body);
  return {
    schemaPath: pointer(...at, 'responses', statusKey, 'content', 'application/json', 'schema'),
    issues: result.success ? [] : describeIssues(result.error.issues),
  };
}

/**
 * Call every handler whose key the document declares, and validate the body
 * it answers against the response schema the operation declares for the
 * status it answered with (`default` when that status has none).
 *
 * Coverage (`contractCoverage`) only proves a handler exists. This proves it
 * answers something the generated client and the page would accept: a mock
 * that returned `{ purchases: [] }` for an operation declaring
 * `{ transactions: [...] }` passes coverage and renders nothing.
 *
 * Each handler gets a synthesized request — the template's path with every
 * parameter bound to its own name, an empty query and no body — unless
 * `samples` supplies one for its key. Supply one wherever the default would
 * miss the fixture (a by-id read answering 404) and the success shape is the
 * one worth checking.
 *
 * A body is validated only for a declared `application/json` response, and
 * never for a status that cannot carry one (204, 205, 304) even where the
 * document declares a schema for it; a status the operation does not declare
 * is itself reported as an issue.
 *
 * @throws When `document` has no `paths` object.
 */
export async function contractResponseConformance(
  document: unknown,
  handlers: MockHandlers,
  samples: Readonly<Record<OperationKey, SampleRequest>> = {}
): Promise<ResponseConformance[]> {
  if (!isRecord(document) || !isRecord(document['paths'])) {
    throw new Error('contractResponseConformance: not an OpenAPI document (no `paths` object)');
  }
  const paths = document['paths'];
  const out: ResponseConformance[] = [];
  for (const key of Object.keys(handlers).toSorted()) {
    const handler = handlers[key];
    const [method = '', template = ''] = key.split(' ');
    const item = paths[template];
    const operation = isRecord(item) ? item[method.toLowerCase()] : undefined;
    if (handler === undefined || !isRecord(operation)) continue;

    const answer = await handler(sampleRequest(key, samples[key]));
    const status = answer.status ?? 200;
    const operationId = operation['operationId'];
    out.push({
      operation: key,
      operationId: typeof operationId === 'string' ? operationId : undefined,
      status,
      ...checkBody({
        document,
        operation,
        at: ['paths', template, method.toLowerCase()],
        status,
        body: answer.body,
      }),
    });
  }
  return out;
}
