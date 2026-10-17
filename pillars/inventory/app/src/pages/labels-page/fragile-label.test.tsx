import { act, cleanup, render, renderHook, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { sheetLayout } from '@pops/inventory/labels';

import { storeCustomSheet } from './label-storage';
import { ContentLabel } from './label-templates';
import { planLabels } from './plan-labels';
import { SheetFitNotice } from './print-options';
import { useLabelJob } from './useLabelJob';

import type { PrintSubject, ResolvedLabel } from '@pops/inventory/labels';

afterEach(cleanup);

const subject: PrintSubject = {
  id: '8c1e4f2a-5b7d-4a9e-b3c6-000000000001',
  name: 'Books 2',
  code: 'B002',
  suggestedCode: null,
  kind: 'container',
  place: null,
  quantity: 1,
};

function preview(parts: ResolvedLabel['parts'], fragile: boolean, contents: string[] = []) {
  return render(
    <ContentLabel
      subject={subject}
      layout={sheetLayout('L7169')}
      label={{ parts, fields: [], contents, fallback: false }}
      fragile={fragile}
    />
  );
}

describe('printed fragile warning', () => {
  it.each([false, true])(
    'keeps QR, text and warning in source order with contents=%s',
    (withContents) => {
      const { container } = preview(
        ['qr', 'name', 'code', ...(withContents ? ['contents' as const] : [])],
        true,
        withContents ? ['Cups', 'Plates'] : []
      );
      const warning = container.querySelector<HTMLElement>('[data-label-fragile]');
      const qr = screen.getByRole('img', { name: 'QR code for Books 2' });
      const name = screen.getByText('Books 2');
      if (!warning) throw new Error('missing warning');
      expect(warning.style.width).toBe('24mm');
      expect(warning.style.height).toBe('24mm');
      expect(qr.parentElement?.style.width).toBe(warning.style.width);
      expect(qr.parentElement?.style.height).toBe(warning.style.height);
      expect(qr.compareDocumentPosition(name) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(name.compareDocumentPosition(warning) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(screen.getByRole('img', { name: 'Fragile: cracked glass' })).toBeInTheDocument();
      if (withContents)
        expect(screen.getByRole('list', { name: 'Contents' })).toHaveTextContent('CupsPlates');
    }
  );

  it.each([null, 'BOX-KITCHEN-1'])(
    'does not print an unchecked code after fitting L7159 with code=%s',
    (code) => {
      const selected = { ...subject, code };
      const layout = sheetLayout('L7159');
      const planned = planLabels({
        subjects: [selected],
        copies: { container: 4, item: 1 },
        content: { kind: 'parts', parts: ['qr', 'name'], fields: ['box.unpack'] },
        details: new Map([
          [
            subject.id,
            {
              typeName: 'Storage box',
              fields: [{ id: 'box.unpack', label: 'Unpack in', value: 'Kitchen' }],
              contents: [],
            },
          ],
        ]),
        layout,
        fragileIds: new Set([subject.id]),
      });
      expect(planned.tooSmall).toBe(false);
      expect(planned.entries).toHaveLength(4);
      expect(planned.adjustments.trimmed).toBe(4);
      for (const entry of planned.entries) {
        expect(entry.label.parts).not.toContain('code');
        const { container, unmount } = render(<ContentLabel {...entry} layout={layout} />);
        expect(screen.getByRole('img', { name: 'QR code for Books 2' })).toBeInTheDocument();
        expect(screen.getByRole('img', { name: 'Fragile: cracked glass' })).toBeInTheDocument();
        expect(container.querySelector('[data-code-pt], [data-missing-code]')).toBeNull();
        unmount();
      }
    }
  );

  it('omits the warning when it is not selected', () => {
    preview(['qr', 'name', 'code'], false);
    expect(screen.queryByRole('img', { name: 'Fragile: cracked glass' })).not.toBeInTheDocument();
  });

  it.each([['qr'] as const, ['code'] as const])('keeps warnings when showing only %s', (part) => {
    preview([part], true);
    expect(screen.getByRole('img', { name: 'Fragile: cracked glass' })).toBeInTheDocument();
  });
});

describe('fragile sheet fit notice', () => {
  it('blocks undersized text-only warnings without claiming a QR is present', () => {
    window.localStorage.clear();
    storeCustomSheet({
      columns: 1,
      rows: 1,
      labelWidthMm: 25,
      labelHeightMm: 30,
      marginTopMm: 0,
      marginLeftMm: 0,
      pitchXMm: 25,
      pitchYMm: 30,
    });
    const print = vi.spyOn(window, 'print').mockImplementation(() => {});
    const { result } = renderHook(() =>
      useLabelJob([subject], {
        sheetId: 'custom',
        content: { kind: 'parts', parts: ['code'], fields: [] },
      })
    );
    expect(result.current.block).toBeNull();
    act(() => result.current.setFragile(subject.id, true));
    expect(result.current.block).toBe('too-small');
    render(<SheetFitNotice job={result.current} />);
    expect(screen.getByRole('alert')).toHaveTextContent('cannot fit the fragile warning');
    expect(screen.getByRole('alert')).not.toHaveTextContent('QR');
    act(() => result.current.print());
    expect(print).not.toHaveBeenCalled();
    print.mockRestore();
    window.localStorage.clear();
  });
});
