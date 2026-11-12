import type { Client } from '../trips-api/client';

/** Reject dispatch or delivery when an optional-context read no longer belongs to its captured API origin. */
export async function readOwner<Value>(
  client: Client,
  origin: string | undefined,
  load: () => Promise<Value>
): Promise<Value> {
  if (client.getConfig().baseUrl !== origin) throw new Error('Trips connection changed');
  const value = await load();
  if (client.getConfig().baseUrl !== origin) throw new Error('Trips connection changed');
  return value;
}
