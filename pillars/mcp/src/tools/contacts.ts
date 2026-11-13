import { readFileSync } from 'node:fs';

import { contractInputs } from '../contract-inputs.js';
import { getPillar } from '../pillar-client.js';
import { projectOperationInput, projectOperationResponse } from './openapi-input.js';
import { mapCallResult, toolError } from './utils.js';

import type { ToolDef } from './tool-def.js';

const document: unknown = JSON.parse(readFileSync(contractInputs.contacts, 'utf8'));
const operations = [
  { id: 'catalogue', description: 'Read the owning Contacts entity type choices and default.' },
  {
    id: 'list',
    description: 'List canonical Contacts entities using the published owner filters.',
  },
  { id: 'get', description: 'Read one Contacts entity by its exact owning identity.' },
  {
    id: 'create',
    description:
      'Create a Contacts entity; omitted fields retain the owner defaults. Read its catalogue before choosing a type.',
  },
  {
    id: 'reference',
    description:
      'Read the Contacts-issued canonical reference for an existing or historical entity identity.',
  },
] as const;
type ContactsOperation = (typeof operations)[number]['id'];
type ContactsShape = {
  entities: Record<ContactsOperation, (input: Record<string, unknown>) => unknown>;
};

/** Five owner-backed canonical Contacts operations; their advertised and runtime schemas share the published contract. */
export const contactsTools: readonly ToolDef[] = operations.map<ToolDef>(({ id, description }) => {
  const operationId = `entities.${id}`;
  const scope = `contacts.${operationId}`;
  const input = projectOperationInput(document, operationId);
  const output = projectOperationResponse(document, operationId, id === 'create' ? 201 : 200);
  return {
    name: scope,
    scope,
    description,
    inputSchema: input.inputSchema,
    readOnly: input.method.toUpperCase() === 'GET',
    handler: async (args) => {
      const validated = input.validate(args);
      if (!validated.valid)
        return toolError(`Invalid Contacts arguments: ${validated.errorMessage}`);
      const result = await getPillar<ContactsShape>('contacts').entities[id](validated.data);
      if (result.kind !== 'ok') return mapCallResult(result, scope);
      if (!output(result.value).valid)
        return toolError('Contacts returned an invalid owner response.');
      if (id === 'reference' && !canonicalReference(result.value))
        return toolError('Contacts returned an inconsistent canonical reference.');
      return mapCallResult(result, scope);
    },
  };
});

function canonicalReference(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    'canonicalId' in value &&
    typeof value.canonicalId === 'string' &&
    value.canonicalId.length > 0 &&
    'uri' in value &&
    value.uri === `pops:contacts/contact/${value.canonicalId}`
  );
}
