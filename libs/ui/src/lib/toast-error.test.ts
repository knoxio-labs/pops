import { toast } from 'sonner';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { formatErrorDetails, toastError, type ApiErrorPresentation } from '../primitives/sonner';

const error: ApiErrorPresentation = {
  code: 'inventory.items.not_found',
  message: 'Item not found',
  requestId: 'req-123',
  retryable: false,
};

describe('toastError', () => {
  beforeEach(() => {
    vi.spyOn(toast, 'error').mockReturnValue('toast-id');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the safe message and code chip', () => {
    toastError(error);

    expect(toast.error).toHaveBeenCalledOnce();
    const [message, options] = vi.mocked(toast.error).mock.calls[0] ?? [];
    expect(message).toBe('Item not found');
    expect(options?.description).toMatchObject({
      props: expect.objectContaining({
        children: error.code,
        className: expect.stringContaining('font-mono'),
      }),
      type: 'code',
    });
  });

  it('copies the documented diagnostic block', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(globalThis.navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    const time = new Date('2026-09-27T01:02:03.000Z');

    toastError(error, { build: 'fabc123', operation: 'inventory.items.read', time });
    const options = vi.mocked(toast.error).mock.calls[0]?.[1];
    expect(options?.action).toMatchObject({ label: 'Copy details' });
    if (
      typeof options?.action !== 'object' ||
      options.action === null ||
      !('onClick' in options.action) ||
      typeof options.action.onClick !== 'function'
    ) {
      throw new Error('toast action was not configured');
    }
    Reflect.apply(options.action.onClick, undefined, []);

    expect(writeText).toHaveBeenCalledWith(
      [
        'Code: inventory.items.not_found',
        'Message: Item not found',
        'Request ID: req-123',
        'Operation: inventory.items.read',
        'Time: 2026-09-27T01:02:03.000Z',
        'Build: fabc123',
      ].join('\n')
    );
  });

  it('never formats absent diagnostics as undefined', () => {
    const details = formatErrorDetails(
      { code: 'web.client.unknown', message: 'Something went wrong', retryable: false },
      { time: new Date('2026-09-27T01:02:03.000Z') }
    );

    expect(details).not.toContain('undefined');
    expect(details).toContain('Request ID: Not available');
    expect(details).toContain('Operation: Not available');
    expect(details).toContain('Build: Not available');
  });
});
