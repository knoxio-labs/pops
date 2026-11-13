/** Published owner contracts admitted by the MCP adapters; copies are byte-checked against their producers. */
export const contractInputs = {
  contacts: new URL('../contracts/contacts.openapi.json', import.meta.url),
  trips: new URL('../contracts/trips.openapi.json', import.meta.url),
};
