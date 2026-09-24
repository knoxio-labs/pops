import { espressoMachine, kitchen12, kitchen12Uncoded } from '@/fixtures/inventory-print';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { decodeQrSvg } from '@pops/ui/testing/decode-qr';

import { ContainerLabel, ItemLabel, PrintLabel } from './label-templates';
import { itemUri } from './print-subject';
import { MIN_QR_MODULE_MM, SHEET_LAYOUTS, sheetLayout } from './sheet-layouts';

import type { PrintSubject } from './print-subject';

afterEach(cleanup);

function renderedQr(): SVGElement {
  const svg = screen.getByRole('img');
  if (!(svg instanceof SVGElement)) throw new Error('the label did not render an SVG QR');
  return svg;
}

const coffeeCups = kitchen12Uncoded[2];

function uncodedCups(): PrintSubject {
  if (!coffeeCups) throw new Error('fixture missing: coffee cups');
  return coffeeCups;
}

describe('label QR', () => {
  it.each(SHEET_LAYOUTS)('decodes to the item URI on a $sizeCode container label', (layout) => {
    render(<ContainerLabel subject={kitchen12} layout={layout} />);
    expect(decodeQrSvg(renderedQr())).toBe(`pops://inventory/item/${kitchen12.id}`);
  });

  it('encodes the id, not the code, so relabelling never breaks a printed QR', () => {
    render(<ItemLabel subject={espressoMachine} layout={sheetLayout('a4-21')} />);
    const decoded = decodeQrSvg(renderedQr());
    expect(decoded).toBe(itemUri(espressoMachine.id));
    expect(decoded).not.toContain(espressoMachine.code ?? 'no code');
  });

  it('still carries a QR when the item has no code', () => {
    const cups = uncodedCups();
    render(<ItemLabel subject={cups} layout={sheetLayout('a4-21')} />);
    expect(decodeQrSvg(renderedQr())).toBe(itemUri(cups.id));
  });

  it.each(SHEET_LAYOUTS)(
    'keeps $sizeCode modules at or above the minimum printed size',
    (layout) => {
      render(<ItemLabel subject={espressoMachine} layout={layout} />);
      const extent = Number(renderedQr().getAttribute('viewBox')?.split(' ')[2]);
      expect(extent).toBeGreaterThan(0);
      expect(layout.scale.qrMm / extent).toBeGreaterThanOrEqual(MIN_QR_MODULE_MM);
    }
  );
});

describe('label text', () => {
  it('prints name, code and place on a container label', () => {
    render(<ContainerLabel subject={kitchen12} layout={sheetLayout('a4-8')} />);
    expect(screen.getByText('Kitchen 12')).toBeTruthy();
    expect(screen.getByText('B412')).toBeTruthy();
    expect(screen.getByText('Kitchen')).toBeTruthy();
  });

  it('prints only the code beside the QR on an item label', () => {
    render(<ItemLabel subject={espressoMachine} layout={sheetLayout('a4-14')} />);
    expect(screen.getByText('BREW-2026-0007-A')).toBeTruthy();
    expect(screen.queryByText(espressoMachine.name)).toBeNull();
  });

  it('prints the name in place of a missing code', () => {
    const cups = uncodedCups();
    render(<ItemLabel subject={cups} layout={sheetLayout('a4-21')} />);
    expect(screen.getByText('Coffee cups')).toBeTruthy();
  });

  it('shrinks a long code instead of truncating it', () => {
    render(<PrintLabel template="item" subject={espressoMachine} layout={sheetLayout('a4-21')} />);
    const code = screen.getByText('BREW-2026-0007-A');
    expect(Number(code.dataset['codePt'])).toBeLessThan(sheetLayout('a4-21').scale.codePt);
    expect(code.textContent).toBe('BREW-2026-0007-A');
  });

  it('switches template by id', () => {
    render(<PrintLabel template="container" subject={kitchen12} layout={sheetLayout('a4-14')} />);
    expect(screen.getByText('Kitchen')).toBeTruthy();
  });
});
