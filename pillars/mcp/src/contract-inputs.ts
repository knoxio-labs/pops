/** Published owner contracts admitted by the MCP adapters; copies are byte-checked against their producers. */
export const contractInputs = {
  trips: new URL('../contracts/trips.openapi.json', import.meta.url),
  documents: new URL('../contracts/documents.openapi.json', import.meta.url),
};
