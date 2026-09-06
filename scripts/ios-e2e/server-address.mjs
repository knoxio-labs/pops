/**
 * The one shape every stub in this harness needs out of `Server#address()`.
 *
 * Node types it `string | AddressInfo | null` because the same call answers for
 * a unix socket and for a server that never bound. Neither can happen here —
 * every server in this directory is `listen(0, '127.0.0.1')` and is asked for
 * its address only after `listening` — but "cannot happen" is exactly the claim
 * that used to be made with a cast, and a cast turns a mis-bound server into a
 * `port` of `undefined` interpolated into a URL that then times out somewhere
 * else entirely.
 */

/** @typedef {import('node:net').AddressInfo} AddressInfo */

/**
 * @param {import('node:net').Server | import('node:http').Server} server
 * @param {string} who Names the caller in the failure, since four servers boot here.
 * @returns {AddressInfo}
 */
export function boundAddress(server, who) {
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error(`${who}: expected a bound TCP server address, got ${JSON.stringify(address)}`);
  }
  return address;
}
