import { getRequestId, mintRequestId } from '@pops/pillar-sdk/server';

import type { ErrorBody } from '@pops/types';

type ErrorDefinition = {
  readonly area: string;
  readonly message: string;
  readonly retryable: boolean;
};

type ErrorBodyOptions = {
  readonly message?: string;
  readonly details?: unknown;
};

type ErrorDefinitionMap<Definitions extends object> = {
  [Reason in keyof Definitions]-?: ErrorDefinition;
};

export function createErrorBodyBuilder<Definitions extends object>(
  namespace: string,
  definitions: Definitions & ErrorDefinitionMap<Definitions>
) {
  return (
    reason: Extract<keyof Definitions, string>,
    options: ErrorBodyOptions = {}
  ): ErrorBody => {
    const definition = definitions[reason];
    return {
      code: `${namespace}.${definition.area}.${reason}`,
      message: options.message ?? definition.message,
      requestId: getRequestId() ?? mintRequestId(),
      retryable: definition.retryable,
      ...(options.details === undefined ? {} : { details: options.details }),
    };
  };
}
