import type { RefObject } from 'react';

import type { PairedDevice } from '../useDevicesPageModel.js';
import type { GrantFailure } from './grant-failures.js';
import type { DeviceGrant } from './grant-selection.js';

/** One isolated editing session; a failure locks writes until an explicit fresh read. */
export interface GrantSession {
  target: PairedDevice | null;
  open: boolean;
  phase: 'loading' | 'ready' | 'saving' | 'failed';
  grant: DeviceGrant | null;
  selection: string[];
  failure: GrantFailure | null;
  saved: boolean;
}

/** Contextual editor actions; reload discards the retained selection and never replays it. */
export interface DevicePermissionsModel extends GrantSession {
  origin: RefObject<HTMLButtonElement | null>;
  request: (device: PairedDevice, origin: HTMLButtonElement) => void;
  close: () => void;
  toggle: (value: string, checked: boolean) => void;
  save: () => void;
  reload: () => void;
}
