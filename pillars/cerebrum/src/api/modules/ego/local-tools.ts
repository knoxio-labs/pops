import { egoEntityPartSchema } from '../../../contract/rest-ego-parts.js';

import type { EgoEntityPart } from '../../../contract/rest-ego-parts.js';
import type { EgoToolDefinition, EgoToolbox, ToolOutcome } from './toolbox.js';
import type { ObjectUriResolver, ResolvedEntity } from './uri/resolver.js';

/** Model-facing name of the local tool that resolves object URIs into cards. */
export const SHOW_ENTITIES_TOOL = 'ego_show_entities';

/** Model-facing name of the local tool that opens an object screen. */
export const NAVIGATE_TOOL = 'ego_navigate';

/** Maximum number of entity URIs accepted by {@link LocalToolbox}. */
export const MAX_SHOWN_ENTITIES = 10;

const SHOW_ENTITIES_DESCRIPTION =
  'Shows each object as a card to the user. This is the only way a card appears. Pass URIs exactly as they appeared in a tool result or in the app context.';
const NAVIGATE_DESCRIPTION =
  "Opens that object's screen for the user. Use only when the user asks to go to it.";

/** Ego-local tools for rendering resolved entity cards and navigating to them. */
export class LocalToolbox implements EgoToolbox {
  constructor(private readonly resolver: Pick<ObjectUriResolver, 'resolve'>) {}

  /** Return the strict model-facing definitions for the two local tools. */
  async definitions(): Promise<EgoToolDefinition[]> {
    return [
      {
        name: SHOW_ENTITIES_TOOL,
        label: SHOW_ENTITIES_TOOL,
        description: SHOW_ENTITIES_DESCRIPTION,
        inputSchema: {
          type: 'object',
          properties: {
            uris: {
              type: 'array',
              items: { type: 'string' },
              minItems: 1,
              maxItems: MAX_SHOWN_ENTITIES,
            },
          },
          required: ['uris'],
          additionalProperties: false,
        },
      },
      {
        name: NAVIGATE_TOOL,
        label: NAVIGATE_TOOL,
        description: NAVIGATE_DESCRIPTION,
        inputSchema: {
          type: 'object',
          properties: { uri: { type: 'string' } },
          required: ['uri'],
          additionalProperties: false,
        },
      },
    ];
  }

  /** Resolve card URIs before returning entity parts, or navigate to one resolved URI. */
  async dispatch(name: string, input: Record<string, unknown>): Promise<ToolOutcome> {
    if (name === SHOW_ENTITIES_TOOL) return this.showEntities(input['uris']);
    if (name === NAVIGATE_TOOL) return this.navigate(input['uri']);
    return errorResult('Unknown tool: ' + name);
  }

  private async showEntities(value: unknown): Promise<ToolOutcome> {
    if (!isStringArray(value) || value.length === 0 || value.length > MAX_SHOWN_ENTITIES) {
      return errorResult(
        'Provide between 1 and ' + MAX_SHOWN_ENTITIES + ' object URIs, each as a string.'
      );
    }

    const uniqueUris = [...new Set(value)];
    const resolutions = await Promise.all(
      uniqueUris.map(async (uri) => ({ uri, entity: await resolveSafely(this.resolver, uri) }))
    );
    const parts = resolutions.flatMap(({ entity }): EgoEntityPart[] =>
      entity === null ? [] : [entityPart(entity)]
    );
    const unresolved = resolutions.filter(({ entity }) => entity === null).map(({ uri }) => uri);
    const text = [
      'Showed ' + parts.length + ' object' + (parts.length === 1 ? '' : 's') + '.',
      ...(unresolved.length === 0 ? [] : ['Could not resolve: ' + unresolved.join(', ') + '.']),
    ].join(' ');

    return { kind: 'result', text, isError: parts.length === 0, parts };
  }

  private async navigate(value: unknown): Promise<ToolOutcome> {
    if (typeof value !== 'string') return errorResult('Provide one object URI as a string.');

    const entity = await resolveSafely(this.resolver, value);
    if (entity === null) return errorResult('Could not resolve URI: ' + value);

    return {
      kind: 'result',
      text: 'Opening ' + entity.title + '.',
      isError: false,
      navigate: value,
    };
  }
}

function entityPart(entity: ResolvedEntity): EgoEntityPart {
  return egoEntityPartSchema.parse({
    type: 'entity',
    uri: entity.uri,
    title: entity.title,
    ...(entity.subtitle === undefined ? {} : { subtitle: entity.subtitle }),
  });
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

async function resolveSafely(
  resolver: Pick<ObjectUriResolver, 'resolve'>,
  uri: string
): Promise<ResolvedEntity | null> {
  try {
    return await resolver.resolve(uri);
  } catch {
    return null;
  }
}

function errorResult(text: string): ToolOutcome {
  return { kind: 'result', text, isError: true };
}
