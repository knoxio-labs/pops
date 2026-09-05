import { PopsTextField } from '@/frames/ios/fields';
import { PopsButton, PopsCard } from '@/frames/ios/primitives';
import { LoadingStateView } from '@/frames/ios/state-views';
import {
  CAMERA_REFUSAL,
  PAIRING_COPY,
  PAIRING_FAILURE,
  REVOCATION_EXPLANATION,
} from '@/kit/ios-pairing-copy';
import { PairingScanner } from '@/kit/ios-pairing-scanner';

import type { ScreenMeta, ScreenStates } from '@/contract';
import type { CameraAccess } from '@/kit/ios-pairing-copy';

export const meta: ScreenMeta = { title: 'Pairing', order: 8, frame: 'ios' };

function ScanSection({ camera }: { camera: CameraAccess }) {
  if (camera === 'authorized') {
    return (
      <PopsCard>
        <PopsButton>{PAIRING_COPY.scan}</PopsButton>
      </PopsCard>
    );
  }
  const refusal = CAMERA_REFUSAL[camera];
  return (
    <PopsCard>
      <div className="space-y-3">
        <p className="ios-body" style={{ color: 'var(--ios-muted-foreground)' }}>
          {refusal.message}
        </p>
        {refusal.settings ? (
          <p className="ios-headline min-h-11 pt-2" style={{ color: 'var(--ios-accent)' }}>
            {PAIRING_COPY.openSettings}
          </p>
        ) : null}
      </div>
    </PopsCard>
  );
}

function Fields({ code }: { code?: string }) {
  return (
    <PopsCard>
      <div className="space-y-4">
        <PopsTextField
          label="Server address"
          placeholder="https://bfm.example.com"
          value="http://localhost:3014"
        />
        <PopsTextField label="Pairing code" placeholder="XXXX-XXXX-XXXX" value={code} />
        <PopsTextField label="Device name" placeholder="This iPhone" value="Joao's iPhone" />
      </div>
    </PopsCard>
  );
}

/**
 * The whole of an unpaired app. Everything here is one decision — trust this
 * server with this device — so the screen carries no chrome, and the scan is
 * offered above the fields rather than beside them: typing an origin and a
 * twelve-character code on a phone is the fallback, not the path.
 *
 * A refused camera does not disable the scan button, it replaces it. A
 * disabled control invites a tap that cannot work; a sentence saying why,
 * with Settings beside it when Settings can actually undo the refusal, ends
 * the question.
 */
export function PairingForm({
  camera = 'authorized',
  code,
  failure,
  returning,
}: {
  camera?: CameraAccess;
  code?: string;
  failure?: string;
  returning?: keyof typeof REVOCATION_EXPLANATION;
}) {
  return (
    <div className="space-y-6 p-4">
      <header className="space-y-2">
        <h1 className="ios-title">{PAIRING_COPY.title}</h1>
        <p className="ios-subheadline" style={{ color: 'var(--ios-muted-foreground)' }}>
          {PAIRING_COPY.subtitle}
        </p>
      </header>
      {returning === undefined ? null : (
        <PopsCard>
          <p className="ios-body">{REVOCATION_EXPLANATION[returning]}</p>
        </PopsCard>
      )}
      <ScanSection camera={camera} />
      <Fields code={code} />
      {failure === undefined ? null : (
        <p className="ios-body" style={{ color: 'var(--ios-destructive)' }}>
          {failure}
        </p>
      )}
      <PopsButton>{PAIRING_COPY.pair}</PopsButton>
    </div>
  );
}

export const states: ScreenStates = {
  scanning: () => <PairingScanner />,
  pairing: () => <LoadingStateView message={PAIRING_COPY.pairing} />,
  'camera-denied': () => <PairingForm camera="denied" />,
  'camera-restricted': () => <PairingForm camera="restricted" />,
  'no-camera': () => <PairingForm camera="unavailable" />,
  'code-rejected': () => <PairingForm failure={PAIRING_FAILURE.rejected} />,
  'rate-limited': () => <PairingForm failure={PAIRING_FAILURE.rateLimited(42)} />,
  unreachable: () => <PairingForm code="7QK4-9M2X-P3ND" failure={PAIRING_FAILURE.unreachable} />,
  revoked: () => <PairingForm returning="revokedByOperator" />,
  expired: () => <PairingForm returning="credentialsRejected" />,
};

export default function PairingScreen() {
  return <PairingForm code="7QK4-9M2X-P3ND" />;
}
