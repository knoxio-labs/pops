import type { EgoToolDefinition, EgoToolbox, ToolOutcome } from '../toolbox.js';
import type { GatewayCaller, GatewayTool } from './gateway-client.js';

interface CachedGatewayTool {
  gatewayName: string;
  readOnlyHint: boolean | undefined;
  definition: EgoToolDefinition;
}

const DEFAULT_CATALOGUE_TTL_MS = 300_000;
const MODEL_TOOL_NAME_PATTERN = /^[a-zA-Z0-9_-]+$/;

/** Map a dotted gateway tool name to a model-safe name. */
export function toModelToolName(gatewayName: string): string {
  return gatewayName.replaceAll('.', '__');
}

/** Format a concise summary of a proposed write, capped at 200 characters. */
export function summariseWrite(tool: string, args: Record<string, unknown>): string {
  return (tool + ' ' + JSON.stringify(args)).slice(0, 200);
}

/** Exposes gateway tools to the model and executes only tools marked read-only. */
export class GatewayToolbox implements EgoToolbox {
  private readonly ttlMs: number;
  private readonly now: () => number;
  private catalogue: CachedGatewayTool[] | undefined;
  private catalogueLoadedAt = 0;

  constructor(
    private readonly caller: GatewayCaller,
    options?: { ttlMs?: number; now?: () => number }
  ) {
    this.ttlMs = options?.ttlMs ?? DEFAULT_CATALOGUE_TTL_MS;
    this.now = options?.now ?? Date.now;
  }

  async definitions(): Promise<EgoToolDefinition[]> {
    if (this.catalogue !== undefined && this.now() - this.catalogueLoadedAt < this.ttlMs) {
      return this.currentDefinitions();
    }

    let tools: GatewayTool[];
    try {
      tools = await this.caller.listTools();
    } catch (error) {
      console.warn('[cerebrum-ego] Failed to list gateway tools: ' + errorMessage(error));
      return this.currentDefinitions();
    }

    const nextCatalogue: CachedGatewayTool[] = [];
    const seen = new Set<string>();
    for (const tool of tools) {
      const name = toModelToolName(tool.name);
      if (name.length > 64 || !MODEL_TOOL_NAME_PATTERN.test(name) || seen.has(name)) {
        console.warn(
          '[cerebrum-ego] Skipping gateway tool ' +
            JSON.stringify(tool.name) +
            ': invalid or duplicate model name.'
        );
        continue;
      }

      seen.add(name);
      nextCatalogue.push({
        gatewayName: tool.name,
        readOnlyHint: tool.readOnlyHint,
        definition: {
          name,
          label: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema,
          ...(tool.readOnlyHint === true ? {} : { write: true }),
        },
      });
    }

    this.catalogue = nextCatalogue;
    this.catalogueLoadedAt = this.now();
    return this.currentDefinitions();
  }

  async dispatch(name: string, input: Record<string, unknown>): Promise<ToolOutcome> {
    if (this.catalogue === undefined || this.catalogue.length === 0) {
      await this.definitions();
    }

    const tool = this.catalogue?.find((candidate) => candidate.definition.name === name);
    if (tool === undefined) {
      return { kind: 'result', text: 'Unknown tool: ' + name, isError: true };
    }

    if (tool.readOnlyHint !== true) {
      return {
        kind: 'write',
        tool: tool.gatewayName,
        args: input,
        summary: summariseWrite(tool.gatewayName, input),
      };
    }

    try {
      const result = await this.caller.callTool(tool.gatewayName, input);
      return { kind: 'result', text: result.text, isError: result.isError };
    } catch (error) {
      return { kind: 'result', text: errorMessage(error), isError: true };
    }
  }

  private currentDefinitions(): EgoToolDefinition[] {
    return (this.catalogue ?? []).map((tool) => tool.definition);
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
