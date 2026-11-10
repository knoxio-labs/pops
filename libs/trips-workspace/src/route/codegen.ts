import type { Plugins } from '@hey-api/openapi-ts';

type ObjectResolver = NonNullable<Plugins.Zod.Resolvers['object']>;

/** Preserve canonical closed-object metadata; open objects and typed records keep the generator's default resolver. */
export const closedResponseObject: ObjectResolver = (context) => {
  const additional = context.schema.additionalProperties;
  if (additional === false || (additional && additional.type === 'never'))
    return context.chain.current.attr('strictObject').call(context.nodes.shape(context));
  return undefined;
};
