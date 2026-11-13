import type { Server } from 'node:http';

import type { Express } from 'express';

/** Binds the selected host, or Node's wildcard default, rejecting bind errors before readiness. */
export function listenPillarServer(app: Express, port: number, host?: string): Promise<Server> {
  return new Promise((resolve, reject) => {
    const server = app.listen({ port, host }, (error?: Error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(server);
    });
  });
}
