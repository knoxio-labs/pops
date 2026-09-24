/**
 * `@pops/pillar-sdk/testing/api-mock` — answer a pillar's REST contract from
 * fixtures, for a pillar app running standalone or under test.
 *
 * A separate entry from `@pops/pillar-sdk/testing` because that barrel reaches
 * `node:child_process` and `node:http`, and this one is loaded by a browser
 * page: everything here is DOM-and-`fetch` only.
 */
export {
  installApiMock,
  type InstallApiMockOptions,
  type MockHandler,
  type MockHandlers,
  type MockRequest,
  type MockResponse,
} from './install.js';
export { matchOperation, type MatchedOperation, type OperationKey } from './router.js';
export { contractCoverage, contractOperations, type ContractCoverage } from './contract.js';
export {
  contractResponseConformance,
  type ResponseConformance,
  type SampleRequest,
} from './responses.js';
