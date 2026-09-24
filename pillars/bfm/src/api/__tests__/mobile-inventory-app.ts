/**
 * The real bfm app over an inventory fake, with one enrolled device's token:
 * what every `/mobile/inventory/*` route suite opens.
 */
import {
  DEFAULT_DEVICE_CAPABILITIES,
  serialiseDeviceCapabilities,
} from '../../contract/capabilities.js';
import { deviceRow } from '../../db/__tests__/helpers.js';
import { devices } from '../../db/index.js';
import { mintAccessToken } from '../auth/access-token.js';
import { createMobileInventoryClient } from '../inventory/client.js';
import { createPillarGateway } from '../pillars/gateway.js';
import { createTestApp, type TestApp } from './harness.js';
import { requestOn } from './test-http.js';

import type { Express } from 'express';
import type supertest from 'supertest';

import type { MobileCapability } from '../../contract/capabilities.js';
import type { MobileInventoryMediaClient } from '../inventory/media-client.js';
import type { PillarHandleFactory } from '../pillars/gateway.js';

const apps: TestApp[] = [];

/** Cleans up every app `openWith` opened; call from `afterEach`. */
export function closeOpenedApps(): void {
  while (apps.length > 0) apps.pop()?.cleanup();
}

export function openWith(
  factory: PillarHandleFactory,
  capabilities: readonly MobileCapability[] = DEFAULT_DEVICE_CAPABILITIES,
  inventoryMedia?: MobileInventoryMediaClient
): { app: Express; token: string } {
  const created = createTestApp({
    inventory: createMobileInventoryClient(createPillarGateway(factory)),
    inventoryMedia,
  });
  apps.push(created);

  const row = deviceRow({
    capabilityMode: 'explicit',
    capabilities: serialiseDeviceCapabilities(capabilities),
  });
  created.db.insert(devices).values(row).run();
  const { token } = mintAccessToken(row.id, created.accessTokenSigningKey);

  return { app: created.app, token };
}

export function get(app: Express, token: string | null, path: string): Promise<supertest.Response> {
  return requestOn(app, (r) => {
    const request = r.get(path);
    return token === null ? request : request.set('Authorization', `Bearer ${token}`);
  });
}
