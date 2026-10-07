/**
 * Whose request this is, carried from the perimeter to the outbound call.
 *
 * `requireDevice` resolves the device once and runs the rest of the request
 * inside this store. The finance handle reads it on every outbound call and
 * names the guest to finance when the device is bound to one, so finance
 * decides what that guest may see on every call and bfm keeps no role.
 *
 * `AsyncLocalStorage` follows a request through every `await`, so two
 * requests in flight at once each read their own device and never the
 * other's.
 */
import { AsyncLocalStorage } from 'node:async_hooks';

interface DeviceSubject {
  /** The guest the device is bound to, or `null` for the operator's own. */
  readonly email: string | null;
}

const deviceSubjectStorage = new AsyncLocalStorage<DeviceSubject>();

/** Run `run` with the calling device's subject visible to every outbound call it makes. */
export function runWithDeviceSubject<T>(email: string | null, run: () => T): T {
  return deviceSubjectStorage.run({ email }, run);
}

/**
 * The guest the current request's device is bound to, or `null` for an
 * operator device.
 *
 * Throws outside {@link runWithDeviceSubject} rather than answering `null`.
 * `null` means "the operator", and a call that lost its device must not be
 * sent to finance with the operator's reach when it may have been a guest's.
 */
export function currentDeviceSubject(): string | null {
  const subject = deviceSubjectStorage.getStore();
  if (subject === undefined) {
    throw new Error(
      '[bfm-api] no device subject in scope: this call did not start behind requireDevice'
    );
  }
  return subject.email;
}
