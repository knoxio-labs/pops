import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { decodeQrSvg } from '../testing/decode-qr';
import { QrCodePopover } from './QrCodePopover';

import type { FormEvent } from 'react';

function clipboard(writeText: ReturnType<typeof vi.fn> | undefined): void {
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: writeText === undefined ? undefined : { writeText },
  });
}

afterEach(() => vi.restoreAllMocks());

describe('QrCodePopover', () => {
  it('opens, decodes the exact link, and immediately copies it', async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    clipboard(write);
    render(<QrCodePopover value="pops-i://CAB-012" label="CAB-012" />);

    fireEvent.click(screen.getByRole('button', { name: 'Show QR code for CAB-012' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Link copied');
    const svg = screen.getByRole('img', { name: 'QR code for CAB-012' });
    if (!(svg instanceof SVGElement)) throw new Error('Expected SVG QR code');
    expect(decodeQrSvg(svg)).toBe('pops-i://CAB-012');
    expect(write).toHaveBeenCalledWith('pops-i://CAB-012');
    fireEvent.click(screen.getByRole('button', { name: 'Copy link' }));
    expect(write).toHaveBeenCalledTimes(2);
  });

  it('retains the QR and link on clipboard rejection and allows retry', async () => {
    const write = vi.fn().mockRejectedValueOnce(new Error('denied')).mockResolvedValue(undefined);
    clipboard(write);
    render(<QrCodePopover value="pops-i://A%2FB" label="A/B" />);

    fireEvent.click(screen.getByRole('button', { name: 'Show QR code for A/B' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('clipboard-write-failed');
    expect(screen.getByText('pops-i://A%2FB')).toBeInTheDocument();
    expect(screen.getByRole('img')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try copying again' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Link copied');
    expect(write).toHaveBeenCalledTimes(2);
  });

  it('reports clipboard unavailability without closing the popup', async () => {
    clipboard(undefined);
    render(<QrCodePopover value="pops-i://K12" label="K12" />);
    fireEvent.click(screen.getByRole('button', { name: 'Show QR code for K12' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('clipboard-unavailable');
    expect(screen.getByText('pops-i://K12')).toBeInTheDocument();
  });

  it.each(['{Enter}', ' '])(
    'isolates keyboard activation %s and popup actions from the row',
    async (key) => {
      const user = userEvent.setup();
      const write = vi.fn().mockResolvedValue(undefined);
      clipboard(write);
      const row = vi.fn();
      render(
        <div
          role="row"
          onClick={row}
          onPointerDown={row}
          onPointerUp={row}
          onKeyDown={row}
          onKeyUp={row}
        >
          <QrCodePopover value="pops-i://K12" label="K12" />
        </div>
      );
      const trigger = screen.getByRole('button', { name: 'Show QR code for K12' });
      trigger.focus();
      await user.keyboard(key);
      expect(await screen.findByRole('status')).toHaveTextContent('Link copied');
      await user.click(screen.getByRole('button', { name: 'Copy link' }));
      expect(write).toHaveBeenCalledTimes(2);
      expect(row).not.toHaveBeenCalled();
      await user.keyboard('{Escape}');
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    }
  );

  it('isolates pointer activation from the row and does not submit an enclosing form', async () => {
    const user = userEvent.setup();
    clipboard(vi.fn().mockResolvedValue(undefined));
    const row = vi.fn();
    const submit = vi.fn((event: FormEvent) => event.preventDefault());
    render(
      <form onSubmit={submit}>
        <div role="row" onClick={row} onPointerDown={row} onPointerUp={row} onKeyDown={row}>
          <QrCodePopover value="pops-i://K12" label="K12" />
        </div>
      </form>
    );
    await user.click(screen.getByRole('button', { name: 'Show QR code for K12' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Link copied');
    expect(row).not.toHaveBeenCalled();
    expect(submit).not.toHaveBeenCalled();
  });
});
