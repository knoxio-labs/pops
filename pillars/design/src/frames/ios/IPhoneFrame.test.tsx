import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { FrameChrome } from '../FrameChrome';
import { IPhoneFrame } from './IPhoneFrame';

afterEach(cleanup);

describe('IPhoneFrame', () => {
  it('puts the surface inside the device, under the status bar', () => {
    const { container } = render(
      <IPhoneFrame>
        <p>surface</p>
      </IPhoneFrame>
    );
    const device = container.querySelector('.ios-device');
    expect(device).not.toBeNull();
    expect(device?.querySelector('.ios-device-content')).toHaveTextContent('surface');
    expect(container.querySelector('.ios-status-bar')).not.toBeNull();
    expect(container.querySelector('.ios-home-indicator')).not.toBeNull();
  });

  it('is selected by the ios frame kind, and only by it', () => {
    const { container, rerender } = render(
      <FrameChrome kind="ios" area="mobile" slug="receipt-detail">
        <p>surface</p>
      </FrameChrome>
    );
    expect(container.querySelector('.ios-device')).not.toBeNull();

    rerender(
      <FrameChrome kind="none" area="mobile" slug="receipt-detail">
        <p>surface</p>
      </FrameChrome>
    );
    expect(container.querySelector('.ios-device')).toBeNull();
    expect(screen.getByText('surface')).toBeInTheDocument();
  });
});
