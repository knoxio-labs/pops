/**
 * Public barrel for `@pops/bfm` — what a consumer gets from
 * `import { … } from '@pops/bfm'`.
 *
 * Contract surface only: zod schemas, inferred types, the ts-rest router.
 * Nothing server-side, nothing that cannot run in a browser. The boundary is
 * enforced by the package's `exports` map — only `.`, `./manifest` and
 * `./openapi` resolve from outside, so `src/api/` is unreachable to consumers.
 */
export * from './rest-device-schemas.js';
export * from './rest-operator-schemas.js';
export * from './rest-schemas.js';
export { bfmDeviceContract, type BfmDeviceContract } from './rest-device.js';
export { bfmOperatorContract, type BfmOperatorContract } from './rest-operator.js';
export { bfmContract, type BfmContract } from './rest.js';
