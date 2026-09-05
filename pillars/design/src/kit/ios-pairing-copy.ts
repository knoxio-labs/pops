/**
 * `PairingCopy.swift`, verbatim. It lives in the kit rather than inside the
 * screen because a pairing design is judged on its sentences more than on its
 * layout — there is almost nothing else on the screen — and a sentence
 * paraphrased here would be reviewed as the app's when it is not.
 */
export const PAIRING_COPY = {
  title: 'Pair this device',
  subtitle: 'Open the Devices page on your Pops server and scan the code it shows.',
  scan: 'Scan QR code',
  pair: 'Pair',
  cancel: 'Cancel',
  pairing: 'Pairing…',
  scannerInstruction: 'Point the camera at the QR code.',
  openSettings: 'Open Settings',
} as const;

export type CameraAccess = 'authorized' | 'denied' | 'restricted' | 'unavailable';

/** What the scan section says when the camera cannot be opened, and whether Settings can undo it. */
export const CAMERA_REFUSAL: Record<
  Exclude<CameraAccess, 'authorized'>,
  { message: string; settings: boolean }
> = {
  denied: {
    message: 'Pops cannot use the camera. Allow it in Settings, or type the details below.',
    settings: true,
  },
  restricted: {
    message: 'Camera access is restricted on this device. Type the details below instead.',
    settings: false,
  },
  unavailable: {
    message: 'This device has no camera. Type the details below instead.',
    settings: false,
  },
};

/**
 * Why an attempt failed. The server does not distinguish an unknown code from
 * an expired or already-used one, so neither does this sentence — and a
 * rejected code is cleared from the field, because it is worthless now.
 */
export const PAIRING_FAILURE = {
  rejected: 'That code did not work. Generate a new one and try again.',
  rateLimited: (seconds: number) =>
    `Too many attempts. Try again in ${seconds} ${seconds === 1 ? 'second' : 'seconds'}.`,
  rateLimitedUnknown: 'Too many attempts. Wait a minute and try again.',
  invalidRequest: 'This version of Pops sent something the server refused. Update the app.',
  unreachable: 'Could not reach that server. Check the address and your connection.',
  keyGeneration: 'This device could not create its security key. Unlock it and try again.',
  credentialStorage:
    'Paired, but this device could not store its credentials. Revoke it on the Devices page and pair again.',
  dependencyNotBound: 'Pops is not set up correctly on this device.',
} as const;

/** Why a device that was paired is back here. Absent entirely for one that never was. */
export const REVOCATION_EXPLANATION = {
  revokedByOperator: 'This device was removed on your Pops server. Pair it again to continue.',
  credentialsRejected: "This device's sign-in expired and could not be renewed. Pair it again.",
} as const;
