import { getRequestId, mintRequestId } from '@pops/pillar-sdk/server';

import type { NextFunction, Request, RequestHandler, Response } from 'express';

import type { DeviceLocals } from '../auth/require-device.js';
import type { MobileBarcodeRelayLogger } from '../rest/mobile-barcode-handlers.js';

/** Log failed mobile barcode attempts that stop before the route handler. */
export function createMobileBarcodeAttemptLogger(
  logger: MobileBarcodeRelayLogger | undefined
): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (logger === undefined) {
      next();
      return;
    }
    const requestId = getRequestId() ?? req.requestId ?? mintRequestId();
    const startedAt = Date.now();
    res.once('finish', () => {
      if (res.statusCode < 400) return;
      const deviceId = (res.locals as DeviceLocals).device?.id;
      logger.info('bfm barcode request rejected', {
        requestId,
        operation: 'mobileBarcode.lookup',
        status: res.statusCode,
        durationMs: Date.now() - startedAt,
        ...(deviceId === undefined ? {} : { deviceId }),
      });
    });
    next();
  };
}
