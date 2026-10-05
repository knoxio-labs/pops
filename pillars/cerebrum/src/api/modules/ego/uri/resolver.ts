import { parseObjectUri } from '../../../../contract/rest-ego-parts.js';

import type { GatewayCaller } from '../gateway/gateway-client.js';

/** An entity card resolved from one ADR-012 object URI. */
export interface ResolvedEntity {
  uri: string;
  title: string;
  subtitle?: string;
}

/** Reads one URI type through a gateway tool and describes its payload. */
export interface UriTypeResolver {
  key: string;
  tool: string;
  args(id: string): Record<string, unknown> | null;
  describe(payload: unknown, id: string): { title: string; subtitle?: string } | null;
}

/** Reads a nested property only while each value is a plain object. */
export function readPath(value: unknown, ...keys: string[]): unknown {
  let current = value;
  for (const key of keys) {
    if (!isPlainObject(current)) return undefined;
    current = current[key];
  }
  return current;
}

/** Resolves object URIs into entity cards using gateway read tools. */
export class ObjectUriResolver {
  private readonly resolvers: ReadonlyMap<string, UriTypeResolver>;

  constructor(
    private readonly caller: GatewayCaller,
    resolvers: readonly UriTypeResolver[]
  ) {
    this.resolvers = new Map(resolvers.map((resolver) => [resolver.key, resolver]));
  }

  /** Resolves one URI, returning null for unsupported or unavailable entities. */
  async resolve(uri: string): Promise<ResolvedEntity | null> {
    try {
      const parsed = parseObjectUri(uri);
      if (parsed === null) return null;

      const resolver = this.resolvers.get(parsed.domain + '/' + parsed.type);
      if (resolver === undefined) return null;

      const args = resolver.args(parsed.id);
      if (args === null) return null;

      const result = await this.caller.callTool(resolver.tool, args);
      if (result.isError) return null;

      const payload: unknown = JSON.parse(result.text);
      const description = resolver.describe(payload, parsed.id);
      if (
        description === null ||
        typeof description.title !== 'string' ||
        description.title.trim().length === 0
      ) {
        return null;
      }

      return {
        uri,
        title: description.title,
        ...(description.subtitle === undefined ? {} : { subtitle: description.subtitle }),
      };
    } catch {
      return null;
    }
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
