/** Contact providers represented by this playground. */
export type ContactProvider = 'Google' | 'iCloud';
/** Connection states shown before and after granting access. */
export type ConnectionState = 'connected' | 'disconnected' | 'loading' | 'error' | 'expired';
/** Plain-language status and action labels shared by cards and dialogs. */
export const connectionCopy = {
  connected: {
    title: 'Connected',
    message: 'Your contacts are ready to preview.',
    action: 'Manage connection',
  },
  disconnected: {
    title: 'Not connected',
    message: 'Bring your contacts together.',
    action: 'Connect account',
  },
  loading: {
    title: 'Connecting',
    message: 'Checking your account access…',
    action: 'View connection',
  },
  error: {
    title: 'Connection failed',
    message: 'Check your account access and try again.',
    action: 'Try again',
  },
  expired: {
    title: 'Reconnect required',
    message: 'Reconnect to get the latest contacts.',
    action: 'Reconnect account',
  },
};
