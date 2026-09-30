import type { ProxyOptions } from 'vite';

function parseRemoteOrigin(value: string): string {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new Error('POPS_DEV_API_ORIGIN must be an HTTPS origin');
  }

  if (
    url.protocol !== 'https:' ||
    url.username.length > 0 ||
    url.password.length > 0 ||
    url.pathname !== '/' ||
    url.search.length > 0 ||
    url.hash.length > 0
  ) {
    throw new Error('POPS_DEV_API_ORIGIN must be an HTTPS origin');
  }

  return url.origin;
}

/**
 * Creates a Vite API proxy that uses local pillar ports by default and can
 * route development requests through a remote shell origin when configured.
 */
export function createDevApiProxy(
  localTarget: string,
  localPrefixToStrip: string | undefined,
  remoteOrigin = process.env.POPS_DEV_API_ORIGIN,
  accessToken = process.env.POPS_DEV_ACCESS_TOKEN
): ProxyOptions {
  if (accessToken !== undefined && remoteOrigin === undefined) {
    throw new Error('POPS_DEV_ACCESS_TOKEN requires POPS_DEV_API_ORIGIN');
  }

  if (accessToken !== undefined && accessToken.length === 0) {
    throw new Error('POPS_DEV_ACCESS_TOKEN must not be empty');
  }

  const target = remoteOrigin === undefined ? localTarget : parseRemoteOrigin(remoteOrigin);
  const isRemote = remoteOrigin !== undefined;

  return {
    target,
    changeOrigin: true,
    ...(isRemote || localPrefixToStrip === undefined
      ? {}
      : {
          rewrite: (urlPath: string) => {
            if (urlPath === localPrefixToStrip || urlPath.startsWith(`${localPrefixToStrip}/`)) {
              return urlPath.slice(localPrefixToStrip.length);
            }
            return urlPath;
          },
        }),
    ...(accessToken === undefined ? {} : { headers: { 'CF-Access-Token': accessToken } }),
  };
}
