/**
 * The rotation tuning panel. What matters here is the promise the panel makes
 * to the operator: moving a slider changes only the preview, saving is what
 * changes the engine, and the reset button un-marks films without deleting
 * anything. Each of those is a separate test because each is a separate way
 * for the panel to quietly lie.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  rotationGetSettingsMock,
  rotationSaveSettingsMock,
  rotationSchedulerRemovalPreviewMock,
  rotationSchedulerResetQueueMock,
} = vi.hoisted(() => ({
  rotationGetSettingsMock: vi.fn(),
  rotationSaveSettingsMock: vi.fn(),
  rotationSchedulerRemovalPreviewMock: vi.fn(),
  rotationSchedulerResetQueueMock: vi.fn(),
}));

vi.mock('../../media-api/index.js', () => ({
  rotationGetSettings: (...args: unknown[]) => rotationGetSettingsMock(...args),
  rotationSaveSettings: (...args: unknown[]) => rotationSaveSettingsMock(...args),
  rotationSchedulerRemovalPreview: (...args: unknown[]) =>
    rotationSchedulerRemovalPreviewMock(...args),
  rotationSchedulerResetQueue: (...args: unknown[]) => rotationSchedulerResetQueueMock(...args),
}));

import { RotationTuningPanel } from './RotationTuningPanel';

function ok<T>(data: T) {
  return { data, error: undefined };
}

const STORED_SETTINGS = {
  enabled: 'true',
  cronExpression: '0 3 * * *',
  targetFreeGb: '100',
  leavingDays: '7',
  dailyAdditions: '2',
  avgMovieGb: '15',
  protectedDays: '30',
  ageExponent: '1.2',
  ratingSpread: '3',
  keepUnwatched: '2.5',
  keepExponent: '1.4',
  graceDays: '30',
};

function ranked(tmdbId: number, title: string, rank: number, pressure: number) {
  return {
    id: tmdbId,
    tmdbId,
    title,
    rank,
    pressure,
    sizeGb: 12.5,
    ageDays: 400,
    ageAnchor: 'acquired' as const,
    watchCount: 1,
    quality: 0.3,
    qualitySource: 'blended' as const,
    keepWeight: 1,
    abandonedProgress: null as number | null,
    abandonWeight: 1,
  };
}

function previewPayload(overrides: Partial<{ topRanked: ReturnType<typeof ranked>[] }> = {}) {
  const topRanked = overrides.topRanked ?? [
    ranked(1, 'Doomed', 1, 918),
    ranked(2, 'Safe For Now', 2, 400),
  ];
  return ok({
    data: {
      plan: {
        deficitGb: 20,
        leavingGb: 0,
        eligibleCount: 50,
        removableCount: 30,
        toMark: [topRanked[0]],
        skippedForOvershoot: [],
        topRanked,
      },
      skippedReason: null,
    },
  });
}

/** The focusable Radix thumb inside one named knob. */
function knob(label: string): HTMLElement {
  return within(screen.getByRole('group', { name: label })).getByRole('slider');
}

/** The value the knob currently reads out beside its label. */
function knobValue(label: string): string {
  const [, readout] = within(screen.getByRole('group', { name: label })).getAllByText(/./, {
    selector: 'span',
  });
  return readout?.textContent ?? '';
}

function renderPanel() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  return render(<RotationTuningPanel />, { wrapper });
}

beforeEach(() => {
  vi.clearAllMocks();
  rotationGetSettingsMock.mockResolvedValue(ok({ data: STORED_SETTINGS }));
  rotationSchedulerRemovalPreviewMock.mockResolvedValue(previewPayload());
  rotationSaveSettingsMock.mockResolvedValue(ok({ data: { success: true, updated: 1 } }));
  rotationSchedulerResetQueueMock.mockResolvedValue(ok({ data: { cleared: 15 } }));
});

describe('RotationTuningPanel', () => {
  it('shows the stored values, not the slider minimums', async () => {
    renderPanel();

    await screen.findByRole('group', { name: 'Age acceleration' });
    expect(knob('Age acceleration')).toHaveAttribute('aria-valuenow', '1.2');
    expect(knob('Unwatched protection')).toHaveAttribute('aria-valuenow', '2.5');
    expect(knob('Grace period (days)')).toHaveAttribute('aria-valuenow', '30');
    expect(knobValue('Age acceleration')).toBe('1.2');
  });

  it('falls back to the documented default, not the slider minimum, on an unreadable value', async () => {
    rotationGetSettingsMock.mockResolvedValue(
      ok({ data: { ...STORED_SETTINGS, ageExponent: 'not-a-number' } })
    );
    renderPanel();

    await screen.findByRole('group', { name: 'Age acceleration' });
    expect(knobValue('Age acceleration')).toBe('1.2');
  });

  it('previews the stored configuration when nothing has been touched', async () => {
    renderPanel();

    await waitFor(() => expect(rotationSchedulerRemovalPreviewMock).toHaveBeenCalled());
    expect(rotationSchedulerRemovalPreviewMock).toHaveBeenCalledWith({
      query: { topCount: 10 },
    });
  });

  it('lists the ranked movies and marks the ones the next cycle would take', async () => {
    renderPanel();

    const doomed = await screen.findByText('Doomed');
    expect(doomed).toHaveClass('font-medium');
    expect(screen.getByText('Safe For Now')).not.toHaveClass('font-medium');
    expect(screen.getByText(/would take the first 1/)).toBeInTheDocument();
  });

  it('shows the abandoned-play component when the ranking recorded one', async () => {
    rotationSchedulerRemovalPreviewMock.mockResolvedValue(
      previewPayload({
        topRanked: [
          { ...ranked(1, 'Doomed', 1, 918), abandonedProgress: 0.08, abandonWeight: 4.2 },
        ],
      })
    );

    renderPanel();

    expect(await screen.findByText(/abandoned at 8%/)).toBeInTheDocument();
  });

  it('re-previews with the edited value without saving it', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderPanel();

    await screen.findByRole('group', { name: 'Age acceleration' });
    knob('Age acceleration').focus();
    await user.keyboard('{ArrowRight}');
    await vi.advanceTimersByTimeAsync(400);

    await waitFor(() =>
      expect(rotationSchedulerRemovalPreviewMock).toHaveBeenCalledWith({
        query: { ageExponent: 1.25, topCount: 10 },
      })
    );
    expect(rotationSaveSettingsMock).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('sends only the edited knobs on save, then clears the dirty state', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderPanel();

    await screen.findByRole('group', { name: 'Grace period (days)' });
    knob('Grace period (days)').focus();
    await user.keyboard('{ArrowRight}');

    const save = screen.getByRole('button', { name: 'Save' });
    await waitFor(() => expect(save).toBeEnabled());
    await user.click(save);

    await waitFor(() =>
      expect(rotationSaveSettingsMock).toHaveBeenCalledWith({ body: { graceDays: 31 } })
    );
    vi.useRealTimers();
  });

  it('keeps Save disabled until something is actually edited', async () => {
    renderPanel();

    await screen.findByRole('group', { name: 'Age acceleration' });
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('discards edits back to the stored values without calling the server', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderPanel();

    await screen.findByRole('group', { name: 'Rating influence' });
    knob('Rating influence').focus();
    await user.keyboard('{ArrowRight}');
    await waitFor(() => expect(knobValue('Rating influence')).toBe('3.25'));

    await user.click(screen.getByRole('button', { name: 'Discard changes' }));

    await waitFor(() => expect(knobValue('Rating influence')).toBe('3'));
    expect(rotationSaveSettingsMock).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('reports how many films the queue reset released, and says nothing was deleted', async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(await screen.findByTestId('rotation-tuning-reset-queue'));

    expect(await screen.findByText(/Un-marked 15 films/)).toBeInTheDocument();
    expect(screen.getByText(/Nothing was deleted/)).toBeInTheDocument();
    expect(rotationSchedulerResetQueueMock).toHaveBeenCalledTimes(1);
  });

  it('surfaces why the preview is empty rather than showing an empty list', async () => {
    rotationSchedulerRemovalPreviewMock.mockResolvedValue(
      ok({ data: { plan: null, skippedReason: 'Radarr not configured' } })
    );
    renderPanel();

    expect(await screen.findByText('Radarr not configured')).toBeInTheDocument();
  });
});
