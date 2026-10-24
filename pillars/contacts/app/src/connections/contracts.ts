/** Supported read-only contact providers exposed by the connection setup flow. */
export type ContactProvider = 'google' | 'icloud';

/** Credential-free connection metadata; latest attempts and usable previews remain distinct. */
export interface ContactConnection {
  accountId: string;
  provider: ContactProvider;
  label?: string;
  connected: boolean;
  reauthorizationRequired: boolean;
  includeOtherContacts: boolean;
  latestRunId: string | null;
  previewRunId: string | null;
}

/** Durable scan status links only completed previews into the ordinary import-review route. */
export interface ContactScan {
  runId: string;
  accountId: string;
  status: string;
  totalCollections: number;
  completedCollections: number;
  batchIds: string[];
  errorCode?: string | null;
}

/** Human-entered iCloud credentials exist only for one explicit connect request. */
export interface IcloudCredentials {
  accountId?: string;
  username: string;
  password: string;
}

/** Provider API boundary; Google returns a browser navigation target rather than fetching consent. */
export interface ConnectionsGateway {
  list: () => Promise<ContactConnection[]>;
  authorize: (accountId: string | undefined, includeOtherContacts: boolean) => Promise<string>;
  connectIcloud: (credentials: IcloudCredentials) => Promise<void>;
  disconnect: (accountId: string) => Promise<void>;
  start: (accountId: string) => Promise<string>;
  scan: (runId: string) => Promise<ContactScan>;
}

/** Modal actions share one explicit operation latch and return through the surrounding connection list. */
export interface ConnectionDialogOptions {
  provider: ContactProvider;
  account?: ContactConnection;
  gateway: ConnectionsGateway;
  onClose: () => void;
  refresh: () => Promise<unknown>;
  navigate: (url: string) => void;
}
