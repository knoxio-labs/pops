/**
 * QrCode — renders a string as a scannable QR code in inline SVG.
 *
 * SVG rather than canvas so the code is resolution-independent, survives a
 * print or a screenshot at any zoom, and is inspectable from the DOM in
 * tests: `QrCode.test.tsx` reads the rendered rects back into a bitmap and
 * decodes it with a third-party reader, which is what makes a wrong
 * coordinate mapping or a missing quiet zone a failing test rather than a
 * code that only misbehaves in front of a real phone.
 */
import QRCode from 'qrcode';

import { cn } from '../lib/utils';

import type { QRCodeErrorCorrectionLevel } from 'qrcode';
import type { ReactElement } from 'react';

/**
 * Modules of blank margin around the symbol. Four is the QR specification's
 * minimum; scanners use it to find the symbol's edges, and dropping it is the
 * classic reason a visually perfect code will not scan.
 */
const QUIET_ZONE_MODULES = 4;

export interface QrCodeProps {
  /** The exact string to encode. Rendered verbatim — nothing is trimmed or normalised. */
  value: string;
  /**
   * Accessible name for the symbol. A QR code carries no text alternative of
   * its own, so a screen reader has nothing without this.
   */
  title: string;
  /**
   * Error-correction level. Higher recovers from more damage at the cost of a
   * denser symbol; `M` (~15%) is the usual choice for a code read off a screen.
   */
  errorCorrectionLevel?: QRCodeErrorCorrectionLevel;
  className?: string;
}

/** A merged horizontal run of dark modules, in module coordinates. */
interface ModuleRun {
  x: number;
  y: number;
  length: number;
}

/**
 * Collapse each row's dark modules into horizontal runs.
 *
 * One `<rect>` per dark module puts ~500 nodes in the DOM for a mid-size
 * symbol; merging runs typically cuts that by more than half, and the painted
 * result is identical because adjacent modules share an edge exactly.
 */
export function toModuleRuns(matrix: { size: number; data: Uint8Array }): ModuleRun[] {
  const runs: ModuleRun[] = [];

  for (let y = 0; y < matrix.size; y += 1) {
    let runStart: number | null = null;

    for (let x = 0; x <= matrix.size; x += 1) {
      const isDark = x < matrix.size && matrix.data[y * matrix.size + x] === 1;

      if (isDark && runStart === null) runStart = x;
      else if (!isDark && runStart !== null) {
        runs.push({ x: runStart, y, length: x - runStart });
        runStart = null;
      }
    }
  }

  return runs;
}

export function QrCode({
  value,
  title,
  errorCorrectionLevel = 'M',
  className,
}: QrCodeProps): ReactElement {
  const { modules } = QRCode.create(value, { errorCorrectionLevel });
  const runs = toModuleRuns(modules);
  const extent = modules.size + QUIET_ZONE_MODULES * 2;

  return (
    <svg
      role="img"
      aria-label={title}
      viewBox={`0 0 ${extent} ${extent}`}
      shapeRendering="crispEdges"
      data-qr-size={modules.size}
      data-qr-quiet-zone={QUIET_ZONE_MODULES}
      className={cn('h-auto w-full max-w-64', className)}
    >
      <rect width={extent} height={extent} className="fill-qr-quiet-zone" />
      {runs.map((run) => (
        <rect
          key={`${run.y}-${run.x}`}
          data-qr-module=""
          x={run.x + QUIET_ZONE_MODULES}
          y={run.y + QUIET_ZONE_MODULES}
          width={run.length}
          height={1}
          className="fill-qr-module"
        />
      ))}
    </svg>
  );
}
