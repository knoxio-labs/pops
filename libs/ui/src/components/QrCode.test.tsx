/**
 * The point of these tests is that they decode.
 *
 * Asserting the `value` prop reached the component proves nothing a typo
 * cannot also satisfy — a QR that encodes the wrong bytes, drops its quiet
 * zone, or transposes x and y renders as a convincing square of noise and
 * fails only in front of a phone camera, where it reads as a server bug. So
 * the rendered SVG is rasterised back into a bitmap and handed to `jsQR`, an
 * independent reader that shares no code with the encoder.
 */
import { render, screen } from '@testing-library/react';
import QRCode from 'qrcode';
import { describe, expect, it, vi } from 'vitest';

import { decodeQrSvg } from '../testing/decode-qr';
import { QrCode, toModuleRuns } from './QrCode';

function renderedSvg(): SVGElement {
  const svg = screen.getByRole('img');
  if (!(svg instanceof SVGElement)) throw new Error('QrCode did not render an SVG');
  return svg;
}

/**
 * Reconstruct the module matrix the SVG actually paints, in module
 * coordinates with the quiet zone subtracted back off.
 */
function paintedMatrix(svg: SVGElement): Uint8Array {
  const size = Number(svg.dataset['qrSize']);
  const quietZone = Number(svg.dataset['qrQuietZone']);
  const matrix = new Uint8Array(size * size);

  for (const rect of svg.querySelectorAll('rect[data-qr-module]')) {
    const x = Number(rect.getAttribute('x')) - quietZone;
    const y = Number(rect.getAttribute('y')) - quietZone;
    for (let offset = 0; offset < Number(rect.getAttribute('width')); offset += 1) {
      matrix[y * size + x + offset] = 1;
    }
  }

  return matrix;
}

describe('QrCode', () => {
  it('round-trips the exact payload the pairing endpoint returns', () => {
    const pairingUrl = 'https://bfm.example.com/devices/pair?code=7QK4-9M2X-P3ND';

    render(<QrCode value={pairingUrl} title="Pairing QR code" />);

    expect(decodeQrSvg(renderedSvg())).toBe(pairingUrl);
  });

  it('round-trips a payload whose characters survive no normalisation', () => {
    const payload = 'https://bfm.example.com/devices/pair?code=a%2Fb+c&x=1#frag';

    render(<QrCode value={payload} title="Pairing QR code" />);

    expect(decodeQrSvg(renderedSvg())).toBe(payload);
  });

  it.each(['L', 'M', 'Q', 'H'] as const)(
    'round-trips at error-correction level %s',
    (errorCorrectionLevel) => {
      const payload = 'https://bfm.example.com/devices/pair?code=ZZ11-YY22-XX33';

      render(
        <QrCode
          value={payload}
          title="Pairing QR code"
          errorCorrectionLevel={errorCorrectionLevel}
        />
      );

      expect(decodeQrSvg(renderedSvg())).toBe(payload);
    }
  );

  /**
   * `jsQR` decodes mirrored symbols on purpose, so the round-trip above stays
   * green if x and y are swapped — while a phone camera, which mostly does
   * not, would refuse the code. Comparing the painted matrix against the
   * encoder's own is what pins the orientation down.
   */
  it('paints the encoder’s matrix in its own orientation, not a reflection of it', () => {
    const payload = 'https://bfm.example.com/devices/pair?code=7QK4-9M2X-P3ND';

    render(<QrCode value={payload} title="Pairing QR code" />);

    const { modules } = QRCode.create(payload, { errorCorrectionLevel: 'M' });
    expect(paintedMatrix(renderedSvg())).toEqual(Uint8Array.from(modules.data));
  });

  it('surrounds the symbol with the specified four-module quiet zone', () => {
    render(<QrCode value="quiet-zone" title="Pairing QR code" />);

    const svg = renderedSvg();
    const size = Number(svg.dataset['qrSize']);
    const quietZone = Number(svg.dataset['qrQuietZone']);

    expect(quietZone).toBe(4);
    expect(svg.getAttribute('viewBox')).toBe(`0 0 ${size + 8} ${size + 8}`);

    const modules = [...svg.querySelectorAll('rect[data-qr-module]')];
    expect(modules.length).toBeGreaterThan(0);
    for (const rect of modules) {
      expect(Number(rect.getAttribute('x'))).toBeGreaterThanOrEqual(quietZone);
      expect(Number(rect.getAttribute('y'))).toBeGreaterThanOrEqual(quietZone);
      expect(
        Number(rect.getAttribute('x')) + Number(rect.getAttribute('width'))
      ).toBeLessThanOrEqual(quietZone + size);
    }
  });

  it('names the symbol for assistive technology, which a QR cannot do itself', () => {
    render(<QrCode value="labelled" title="Scan to pair this device" />);

    expect(screen.getByRole('img', { name: 'Scan to pair this device' })).toBeInTheDocument();
  });

  /**
   * The natural consumer renders a countdown beside the symbol, so the parent
   * re-renders once a second for as long as the code is alive. Re-encoding on
   * every one of those ticks is pure waste — and it also hands React a fresh
   * array of a few hundred `<rect>` elements to reconcile each time.
   */
  it('encodes once per payload, not once per render', () => {
    const encode = vi.spyOn(QRCode, 'create');
    const payload = 'https://bfm.example.com/devices/pair?code=7QK4-9M2X-P3ND';

    const { rerender } = render(<QrCode value={payload} title="Pairing QR code" />);
    const callsAfterFirstPaint = encode.mock.calls.length;

    rerender(<QrCode value={payload} title="Pairing QR code" />);
    rerender(<QrCode value={payload} title="Pairing QR code" />);

    expect(encode.mock.calls.length).toBe(callsAfterFirstPaint);
    encode.mockRestore();
  });

  it('re-encodes when the payload actually changes', () => {
    const encode = vi.spyOn(QRCode, 'create');

    const { rerender } = render(<QrCode value="first" title="Pairing QR code" />);
    const callsAfterFirstPaint = encode.mock.calls.length;

    rerender(<QrCode value="second" title="Pairing QR code" />);

    expect(encode.mock.calls.length).toBeGreaterThan(callsAfterFirstPaint);
    expect(decodeQrSvg(renderedSvg())).toBe('second');
    encode.mockRestore();
  });

  /**
   * Asserted on the encoder call rather than on `qrSize`: a short payload fits
   * version 1 at every level, so the symbol can legitimately come back the
   * same size while still having been re-encoded.
   */
  it('re-encodes when the error-correction level changes', () => {
    const encode = vi.spyOn(QRCode, 'create');

    const { rerender } = render(
      <QrCode value="ecc" title="Pairing QR code" errorCorrectionLevel="L" />
    );
    encode.mockClear();

    rerender(<QrCode value="ecc" title="Pairing QR code" errorCorrectionLevel="H" />);

    expect(encode).toHaveBeenCalledWith('ecc', { errorCorrectionLevel: 'H' });
    expect(decodeQrSvg(renderedSvg())).toBe('ecc');
    encode.mockRestore();
  });

  it('paints a light quiet-zone backdrop under the dark modules', () => {
    render(<QrCode value="contrast" title="Pairing QR code" />);

    const [backdrop] = [...renderedSvg().querySelectorAll('rect')];
    expect(backdrop).toHaveClass('fill-qr-quiet-zone');
    expect(backdrop).not.toHaveAttribute('data-qr-module');
  });
});

describe('toModuleRuns', () => {
  it('merges adjacent dark modules in a row into one run', () => {
    const runs = toModuleRuns({
      size: 4,
      data: Uint8Array.from([0, 1, 1, 1, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0]),
    });

    expect(runs).toEqual([
      { x: 1, y: 0, length: 3 },
      { x: 0, y: 2, length: 1 },
      { x: 2, y: 2, length: 1 },
    ]);
  });

  it('closes a run that reaches the right edge rather than dropping it', () => {
    const runs = toModuleRuns({ size: 3, data: Uint8Array.from([0, 1, 1, 0, 0, 0, 0, 0, 0]) });

    expect(runs).toEqual([{ x: 1, y: 0, length: 2 }]);
  });

  it('never merges across rows', () => {
    const runs = toModuleRuns({ size: 2, data: Uint8Array.from([0, 1, 1, 0]) });

    expect(runs).toEqual([
      { x: 1, y: 0, length: 1 },
      { x: 0, y: 1, length: 1 },
    ]);
  });

  it('returns nothing for an all-light matrix', () => {
    expect(toModuleRuns({ size: 3, data: new Uint8Array(9) })).toEqual([]);
  });
});
