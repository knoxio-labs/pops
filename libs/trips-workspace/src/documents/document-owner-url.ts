/** Resolve a configured browser owner exactly; absent origins and credential-bearing URLs cannot name persistent storage. */
export function documentOwnerUrl(baseUrl: string | undefined): string | null {
  if (baseUrl === undefined || baseUrl.length === 0) return null;
  try {
    const url = new URL(baseUrl, typeof location === 'undefined' ? undefined : location.href);
    if ((url.protocol !== 'http:' && url.protocol !== 'https:') || url.username || url.password)
      return null;
    return url.href;
  } catch {
    return null;
  }
}
