/**
 * Publishes the user-defined type the inventory-types acceptance flow
 * (`clients/ios/.maestro/acceptance/`) syncs to the phone: `Phone gadget`,
 * with a stored integer `Price`, a computed, overridable `Doubled price`
 * (`Price + Price`), and a stored many-valued short-text `Tags`, at
 * catalogue minimum protocol 2.
 *
 * Done the way an owner does it, against the real pillar behind the gate:
 * raise the sync minimum through the rollout route, then draft, patch and
 * publish over the catalogue routes, all with the BFM's service-account key,
 * whose root `inventory` grant (`upstream-stub.mjs`) covers
 * `inventory.types.manage`. Idempotent, because the lane retries a failed
 * flow against the same pillar database: a second call finds the type
 * already published and returns it unchanged.
 */
import { z } from 'zod';

export const USER_TYPE_KEY = 'acc_phone_gadget';

const descriptorSchema = z.object({
  revision: z.object({ revision: z.number().int(), draftVersion: z.number().int() }),
  types: z.array(
    z.object({
      id: z.string(),
      key: z.string(),
      fields: z.array(z.object({ id: z.string(), key: z.string() })),
    })
  ),
});
const patchedSchema = z.object({ draft: descriptorSchema });
const rolloutSchema = z.object({ minimumProtocol: z.number().int() });

/** @typedef {z.infer<typeof descriptorSchema>} Descriptor */

/**
 * @param {string} baseUrl
 * @param {string} apiKey
 * @param {string} path
 * @param {{ body?: unknown, method?: string }} [init]
 * @returns {Promise<unknown>}
 */
async function call(baseUrl, apiKey, path, init = {}) {
  const method = init.method ?? (init.body === undefined ? 'GET' : 'POST');
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { 'content-type': 'application/json', 'x-api-key': apiKey },
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${method} ${path} answered ${response.status}: ${text}`);
  return text === '' ? null : JSON.parse(text);
}

/**
 * @param {Descriptor} descriptor
 * @param {string} key
 */
function fieldId(descriptor, key) {
  const id = descriptor.types
    .find((type) => type.key === USER_TYPE_KEY)
    ?.fields.find((field) => field.key === key)?.id;
  if (id === undefined) throw new Error(`${USER_TYPE_KEY}.${key} is missing`);
  return id;
}

/**
 * @param {{ inventoryBaseUrl: string, apiKey: string }} options
 * @returns {Promise<{ typeId: string, revision: number, priceFieldId: string, doubledFieldId: string, tagsFieldId: string }>}
 */
export async function publishUserDefinedType({ inventoryBaseUrl, apiKey }) {
  /**
   * @param {string} path
   * @param {{ body?: unknown, method?: string }} [init]
   */
  const at = (path, init) => call(inventoryBaseUrl, apiKey, path, init);

  const rollout = rolloutSchema.parse(await at('/type-catalogue/protocol-rollout'));
  if (rollout.minimumProtocol < 2) {
    await at('/type-catalogue/protocol-rollout', {
      body: { expectedMinimumProtocol: rollout.minimumProtocol, minimumProtocol: 2 },
    });
  }

  let published = descriptorSchema.parse(await at('/type-catalogue'));
  if (!published.types.some((type) => type.key === USER_TYPE_KEY)) {
    const baseRevision = published.revision.revision;
    const created = descriptorSchema.parse(
      await at('/type-catalogue/drafts', { body: { baseRevision } })
    );
    const draftPath = `/type-catalogue/drafts/${created.revision.revision}`;
    /**
     * @param {Descriptor} draft
     * @param {unknown[]} operations
     */
    const patch = async (draft, operations) =>
      patchedSchema.parse(
        await at(draftPath, {
          method: 'PATCH',
          body: { baseRevision, expectedDraftVersion: draft.revision.draftVersion, operations },
        })
      ).draft;

    const withType = await patch(created, [
      { kind: 'put_type', key: USER_TYPE_KEY, label: 'Phone gadget' },
    ]);
    const typeId = withType.types.find((type) => type.key === USER_TYPE_KEY)?.id;
    const withPrice = await patch(withType, [
      {
        kind: 'put_field',
        typeId,
        key: 'price',
        label: 'Price',
        fieldKind: 'integer',
        cardinality: 'one',
        required: false,
        storage: 'stored',
      },
    ]);
    const read = { op: 'read', path: [], fieldId: fieldId(withPrice, 'price') };
    const withDoubled = await patch(withPrice, [
      {
        kind: 'put_field',
        typeId,
        key: 'doubled',
        label: 'Doubled price',
        fieldKind: 'integer',
        cardinality: 'one',
        required: false,
        storage: 'computed',
        allowOverride: true,
        expressionVersion: 1,
        expression: { op: 'add', left: read, right: read },
      },
    ]);
    const withTags = await patch(withDoubled, [
      {
        kind: 'put_field',
        typeId,
        key: 'tags',
        label: 'Tags',
        fieldKind: 'short_text',
        cardinality: 'many',
        required: false,
        storage: 'stored',
      },
    ]);
    published = descriptorSchema.parse(
      await at(`${draftPath}/publish`, {
        body: {
          baseRevision,
          expectedDraftVersion: withTags.revision.draftVersion,
          minimumProtocol: 2,
          note: 'ios-e2e inventory-types acceptance',
        },
      })
    );
  }
  const type = published.types.find((candidate) => candidate.key === USER_TYPE_KEY);
  if (type === undefined) throw new Error(`${USER_TYPE_KEY} was not published`);
  return {
    typeId: type.id,
    revision: published.revision.revision,
    priceFieldId: fieldId(published, 'price'),
    doubledFieldId: fieldId(published, 'doubled'),
    tagsFieldId: fieldId(published, 'tags'),
  };
}
