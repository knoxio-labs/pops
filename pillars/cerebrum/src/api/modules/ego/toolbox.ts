import type { EgoEntityPart } from '../../../contract/rest-ego-parts.js';
import type { GatewayCaller } from './gateway/gateway-client.js';
import type { EgoLlmTool } from './llm.js';

/** A model tool definition with a user-facing label and optional write marker. */
export interface EgoToolDefinition extends EgoLlmTool {
  label: string;
  write?: boolean;
}

/** The outcome of dispatching a model tool call. */
export type ToolOutcome =
  | {
      kind: 'result';
      text: string;
      isError: boolean;
      parts?: EgoEntityPart[];
      navigate?: string;
    }
  | {
      kind: 'write';
      tool: string;
      args: Record<string, unknown>;
      summary: string;
    };

/** Provides the model-facing definitions and dispatches model tool calls. */
export interface EgoToolbox {
  definitions(): Promise<EgoToolDefinition[]>;
  dispatch(name: string, input: Record<string, unknown>): Promise<ToolOutcome>;
}

/** Expose only read tools and reject dispatches for tools outside that list. */
export function readOnlyToolbox(box: EgoToolbox): EgoToolbox;
export function readOnlyToolbox(box: undefined): undefined;
export function readOnlyToolbox(box: EgoToolbox | undefined): EgoToolbox | undefined;
export function readOnlyToolbox(box: EgoToolbox | undefined): EgoToolbox | undefined {
  if (box === undefined) return undefined;
  const readOnly: EgoToolbox = {
    async definitions() {
      return (await box.definitions()).filter((definition) => definition.write !== true);
    },

    async dispatch(name, input) {
      const definitions = await readOnly.definitions();
      if (!definitions.some((definition) => definition.name === name)) {
        return { kind: 'result', text: 'Unknown tool: ' + name, isError: true };
      }
      return box.dispatch(name, input);
    },
  };
  return readOnly;
}

/** The toolbox and gateway client provided to the Ego HTTP layer. */
export interface EgoTools {
  toolbox: EgoToolbox;
  gateway: GatewayCaller;
}

/** Combine toolboxes, rejecting duplicate model names and routing by the latest definitions. */
export function composeToolboxes(...boxes: EgoToolbox[]): EgoToolbox {
  let owners = new Map<string, EgoToolbox>();

  return {
    async definitions() {
      const nextOwners = new Map<string, EgoToolbox>();
      const definitions: EgoToolDefinition[] = [];

      for (const box of boxes) {
        for (const definition of await box.definitions()) {
          if (nextOwners.has(definition.name)) {
            throw new Error('Duplicate tool name: ' + definition.name);
          }
          nextOwners.set(definition.name, box);
          definitions.push(definition);
        }
      }

      owners = nextOwners;
      return definitions;
    },

    async dispatch(name, input) {
      const owner = owners.get(name);
      if (owner === undefined) {
        return { kind: 'result', text: 'Unknown tool: ' + name, isError: true };
      }
      return owner.dispatch(name, input);
    },
  };
}
