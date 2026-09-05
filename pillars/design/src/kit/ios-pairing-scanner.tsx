import { PopsButton } from '@/frames/ios/primitives';
import { PAIRING_COPY } from '@/kit/ios-pairing-copy';

/**
 * The scanner sheet, drawn as the camera behind it would leave it: a dark
 * preview with the code framed in the middle. It keeps looking rather than
 * complaining at a QR code that is not a pairing link — the world has other
 * QR codes in it, and an error for each one would make the scanner useless
 * pointed at a shelf.
 */
export function PairingScanner() {
  return (
    <div className="flex h-full flex-col justify-center gap-4 p-4">
      <p className="ios-body text-center">{PAIRING_COPY.scannerInstruction}</p>
      <div
        className="flex aspect-square items-center justify-center rounded-xl"
        style={{ background: 'color-mix(in srgb, var(--ios-foreground) 88%, transparent)' }}
      >
        <span
          className="h-40 w-40 rounded-lg"
          style={{ border: '3px solid color-mix(in srgb, white 70%, transparent)' }}
          aria-hidden
        />
      </div>
      <div className="flex justify-center">
        <PopsButton>{PAIRING_COPY.cancel}</PopsButton>
      </div>
    </div>
  );
}
