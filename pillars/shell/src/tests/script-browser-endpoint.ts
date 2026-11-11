import { z } from 'zod';

/** Validate a discovered endpoint before any connection can receive page targets. */
export function validateScriptBrowserEndpoint(value: unknown, port: number): string {
  const { webSocketDebuggerUrl } = z.object({ webSocketDebuggerUrl: z.string() }).parse(value);
  const endpoint = new URL(webSocketDebuggerUrl);
  if (
    endpoint.protocol !== 'ws:' ||
    endpoint.hostname !== '127.0.0.1' ||
    endpoint.port !== String(port) ||
    endpoint.username ||
    endpoint.password ||
    endpoint.search ||
    endpoint.hash ||
    !endpoint.pathname.startsWith('/devtools/browser/')
  ) {
    throw new Error('Discovered CDP endpoint is outside the launched browser address');
  }
  return endpoint.href;
}

/** Public socket operations needed only during endpoint ownership proof. */
export interface ScriptBrowserProofSocket extends EventTarget {
  readonly send: (data: string) => void;
}

/** Establish process identity through an opaque, zero-page context created by the owned launcher. */
export async function proveScriptBrowserEndpoint(
  socket: ScriptBrowserProofSocket,
  marker: string
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      socket.removeEventListener('message', received);
      socket.removeEventListener('close', closed);
      socket.removeEventListener('error', failed);
    };
    const closed = () => {
      cleanup();
      reject(new Error('CDP endpoint closed before ownership proof'));
    };
    const failed = () => {
      cleanup();
      reject(new Error('CDP endpoint failed before ownership proof'));
    };
    const received = (event: Event) => {
      if (!(event instanceof MessageEvent)) {
        cleanup();
        reject(new Error('Non-message CDP ownership event'));
        return;
      }
      try {
        if (typeof event.data !== 'string') throw new Error('Non-text CDP ownership reply');
        const reply = z
          .object({
            id: z.number().optional(),
            sessionId: z.string().optional(),
            error: z.unknown().optional(),
            result: z.object({ browserContextIds: z.array(z.string()) }).optional(),
          })
          .parse(JSON.parse(event.data));
        if (reply.id !== 1) return;
        if (
          reply.sessionId !== undefined ||
          reply.error !== undefined ||
          !reply.result?.browserContextIds.includes(marker)
        )
          throw new Error('CDP endpoint does not belong to the launched browser');
        cleanup();
        resolve();
      } catch (error) {
        cleanup();
        reject(error);
      }
    };
    socket.addEventListener('message', received);
    socket.addEventListener('close', closed);
    socket.addEventListener('error', failed);
    socket.send(JSON.stringify({ id: 1, method: 'Target.getBrowserContexts' }));
  });
}

/** Open a local CDP socket without dropping an error or close during connection setup. */
export async function openScriptBrowserSocket(endpoint: string): Promise<WebSocket> {
  const socket = new WebSocket(endpoint);
  try {
    await new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        socket.removeEventListener('open', opened);
        socket.removeEventListener('close', closed);
        socket.removeEventListener('error', failed);
      };
      const opened = () => {
        cleanup();
        resolve();
      };
      const closed = () => {
        cleanup();
        reject(new Error('CDP socket closed during setup'));
      };
      const failed = () => {
        cleanup();
        reject(new Error('CDP socket failed during setup'));
      };
      socket.addEventListener('open', opened);
      socket.addEventListener('close', closed);
      socket.addEventListener('error', failed);
    });
    return socket;
  } catch (error) {
    socket.close();
    throw error;
  }
}
