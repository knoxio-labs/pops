import { PopsPhoto } from '@/frames/ios/fields';
import { PopsActionBar, PopsButton, PopsCard } from '@/frames/ios/primitives';
import { PopsStatusHeader } from '@/frames/ios/state-views';
import { IosSectionHeader } from '@/kit/ios-controls';
import { CAPTURE_HINTS, RECEIPT_COPY } from '@/kit/ios-receipt-copy';
import { Info, OctagonX, Rows3, ScanText, Sun, TriangleAlert } from 'lucide-react';

import type { ScreenMeta, ScreenStates } from '@/contract';
import type { ReactNode } from 'react';

export const meta: ScreenMeta = { title: 'Receipt capture', order: 9, frame: 'ios' };

type Refusal = 'denied' | 'restricted' | 'unavailable';

const REFUSAL: Record<
  Refusal,
  { tone: 'warning' | 'information'; title: string; message: string; settings: boolean }
> = {
  denied: {
    tone: 'warning',
    title: 'Camera access is off',
    message: "Pops can't use the camera. Allow camera access in Settings to photograph a receipt.",
    settings: true,
  },
  restricted: {
    tone: 'warning',
    title: 'Camera access is managed',
    message:
      "Camera access is turned off by a profile or Screen Time policy on this device, so a receipt can't be photographed here.",
    settings: false,
  },
  unavailable: {
    tone: 'information',
    title: 'No camera on this device',
    message: "This device has no camera, so a receipt can't be photographed here.",
    settings: false,
  },
};

const HINTS = CAPTURE_HINTS.map((text, index) => ({
  text,
  Icon: [Rows3, Sun, ScanText][index] ?? ScanText,
}));

function Guidance() {
  return (
    <section className="space-y-2">
      <IosSectionHeader>{RECEIPT_COPY.guidance}</IosSectionHeader>
      <PopsCard>
        <div className="space-y-3">
          {HINTS.map(({ text, Icon }) => (
            <div key={text} className="flex gap-3">
              <Icon
                size={18}
                className="mt-0.5 shrink-0"
                style={{ color: 'var(--ios-muted-foreground)' }}
              />
              <p className="ios-body">{text}</p>
            </div>
          ))}
        </div>
      </PopsCard>
    </section>
  );
}

function Problem({ message }: { message: string }) {
  return (
    <PopsCard>
      <div className="flex gap-3">
        <OctagonX
          size={18}
          className="mt-0.5 shrink-0"
          style={{ color: 'var(--ios-destructive)' }}
        />
        <p className="ios-body">{message}</p>
      </div>
    </PopsCard>
  );
}

/**
 * The tab's root, and a screen whose whole job is to be pressed. The receipt
 * silhouette beside the heading is the only picture on it: this is the one
 * surface where a reader has to know what to point a camera at before they
 * have anything of their own to look at.
 *
 * A refusal that Settings cannot undo leaves the action bar empty rather than
 * disabled. There is nothing to press, and a greyed button says there is.
 */
export function CapturePrompt({ refusal, problem }: { refusal?: Refusal; problem?: string }) {
  const refused = refusal === undefined ? undefined : REFUSAL[refusal];
  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-6 p-4">
        <header className="flex items-start gap-4">
          <div className="min-w-0 flex-1 space-y-2">
            <h1 className="ios-large-title">{RECEIPT_COPY.title}</h1>
            <p className="ios-body" style={{ color: 'var(--ios-muted-foreground)' }}>
              {RECEIPT_COPY.subtitle}
            </p>
          </div>
          <PopsPhoto glyph={<ScanText size={28} />} />
        </header>
        {problem === undefined ? null : <Problem message={problem} />}
        {refused === undefined ? null : (
          <PopsStatusHeader
            tone={refused.tone}
            title={refused.title}
            message={refused.message}
            glyph={refused.tone === 'warning' ? <TriangleAlert size={30} /> : <Info size={30} />}
          />
        )}
        <Guidance />
      </div>
      <Bar refused={refused} />
    </div>
  );
}

function Bar({ refused }: { refused?: (typeof REFUSAL)[Refusal] }): ReactNode {
  if (refused === undefined) {
    return (
      <PopsActionBar>
        <PopsButton prominence="prominent">{RECEIPT_COPY.start}</PopsButton>
      </PopsActionBar>
    );
  }
  if (!refused.settings) return null;
  return (
    <PopsActionBar>
      <span
        className="ios-headline min-h-11 w-full pt-2.5 text-center"
        style={{ color: 'var(--ios-accent)' }}
      >
        Open Settings
      </span>
    </PopsActionBar>
  );
}

export const states: ScreenStates = {
  'camera-denied': () => <CapturePrompt refusal="denied" />,
  'camera-restricted': () => <CapturePrompt refusal="restricted" />,
  'no-camera': () => <CapturePrompt refusal="unavailable" />,
  'camera-failed': () => (
    <CapturePrompt problem="The camera stopped before the receipt was captured. Try again." />
  ),
  'no-pages': () => <CapturePrompt problem="No photos came back from that scan. Try again." />,
  'too-many-pages': () => (
    <CapturePrompt problem="That’s 11 photos, and a receipt can be sent as at most 8 photos. Photograph it again in fewer, larger pieces." />
  ),
};

export default function ReceiptCaptureScreen() {
  return <CapturePrompt />;
}
