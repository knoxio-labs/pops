import { createServer } from 'node:net';

import { boundAddress } from './server-address.mjs';

/**
 * Holds a TCP port on the child's bind host across backend builds.
 * Release immediately before spawning the child; repeated releases are safe.
 * @param {string} host The same explicit host the child will bind.
 * @returns {Promise<{ port: number, release: () => Promise<void> }>}
 */
export async function reserveTcpPort(host) {
  const server = createServer((socket) => socket.destroy());
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, host, () => resolve(undefined));
  });
  const { port } = boundAddress(server, 'ios-e2e port reservation');
  /** @type {Promise<void> | undefined} */
  let releasing;
  return {
    port,
    release: () => {
      releasing ??= new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      });
      return releasing;
    },
  };
}
