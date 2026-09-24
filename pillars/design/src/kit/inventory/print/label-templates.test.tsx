import { espressoMachine, kitchen12, kitchen12Uncoded } from '@/fixtures/inventory-print';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import {
  itemUri,
  customLayout,
  MIN_QR_MODULE_MM,
  QR_EXTENT_MODULES,
  SHEET_PRESETS,
  sheetLayout,
} from '@pops/inventory/labels';
import { decodeQrSvg } from '@pops/ui/testing/decode-qr';

import { ContainerLabel, ItemLabel, PrintLabel } from './label-templates';

import type { PrintSubject, SheetLayout } from '@pops/inventory/labels';

afterEach(cleanup);

function renderedQr(): SVGElement {
  const svg = screen.getByRole('img');
  if (!(svg instanceof SVGElement)) throw new Error('the label did not render an SVG QR');
  return svg;
}

function uncodedCups(): PrintSubject {
  const cups = kitchen12Uncoded[2];
  if (!cups) throw new Error('fixture missing: coffee cups');
  return cups;
}

const custom27 = customLayout({
  columns: 3,
  rows: 9,
  labelWidthMm: 63.5,
  labelHeightMm: 29.6,
  marginTopMm: 15.3,
  marginLeftMm: 7.21,
  pitchXMm: 66.04,
  pitchYMm: 29.6,
});

const EVERY_LAYOUT: SheetLayout[] = [...SHEET_PRESETS, custom27];

describe('label QR', () => {
  it.each(EVERY_LAYOUT)('decodes to the item URI on a $id box label', (layout) => {
    render(<ContainerLabel subject={kitchen12} layout={layout} />);
    expect(decodeQrSvg(renderedQr())).toBe(`pops://inventory/item/${kitchen12.id}`);
  });

  it.each(EVERY_LAYOUT)('decodes to the item URI on a $id item label', (layout) => {
    render(<ItemLabel subject={espressoMachine} layout={layout} />);
    expect(decodeQrSvg(renderedQr())).toBe(itemUri(espressoMachine.id));
  });

  it('encodes the id, not the code, so relabelling never breaks a printed QR', () => {
    render(<ItemLabel subject={espressoMachine} layout={sheetLayout('L7160')} />);
    expect(decodeQrSvg(renderedQr())).not.toContain(espressoMachine.code ?? 'no code');
  });

  it('draws a UUID item URI in the module count the layout maths assumes', () => {
    render(<ItemLabel subject={espressoMachine} layout={sheetLayout('L7160')} />);
    expect(Number(renderedQr().getAttribute('viewBox')?.split(' ')[2])).toBe(QR_EXTENT_MODULES);
  });

  it.each(EVERY_LAYOUT)('keeps $id modules at or above the minimum printed size', (layout) => {
    render(<ItemLabel subject={espressoMachine} layout={layout} />);
    const extent = Number(renderedQr().getAttribute('viewBox')?.split(' ')[2]);
    expect(extent).toBeGreaterThan(0);
    expect(layout.scale.qrMm / extent).toBeGreaterThanOrEqual(MIN_QR_MODULE_MM);
  });
});

describe('label text', () => {
  it('prints name and code on a box label, and no place', () => {
    render(<ContainerLabel subject={kitchen12} layout={sheetLayout('L7165')} />);
    expect(screen.getByText('Kitchen 12')).toBeTruthy();
    expect(screen.getByText('B412')).toBeTruthy();
    expect(screen.queryByText('Kitchen')).toBeNull();
  });

  it('prints only the code beside the QR on an item label', () => {
    render(<ItemLabel subject={espressoMachine} layout={sheetLayout('L7163')} />);
    expect(screen.getByText('BREW-2026-0007-A')).toBeTruthy();
    expect(screen.queryByText(espressoMachine.name)).toBeNull();
  });

  it('marks where a missing code goes instead of printing the name', () => {
    const cups = uncodedCups();
    render(<ItemLabel subject={cups} layout={sheetLayout('L7160')} />);
    expect(screen.getByText('Needs a code')).toBeTruthy();
    expect(screen.queryByText('Coffee cups')).toBeNull();
  });

  it('shrinks a long code instead of truncating it', () => {
    render(<PrintLabel template="item" subject={espressoMachine} layout={sheetLayout('L7160')} />);
    const code = screen.getByText('BREW-2026-0007-A');
    expect(Number(code.dataset['codePt'])).toBeLessThan(sheetLayout('L7160').scale.codePt);
    expect(code.textContent).toBe('BREW-2026-0007-A');
  });

  it('switches template by id', () => {
    render(<PrintLabel template="container" subject={kitchen12} layout={sheetLayout('L7163')} />);
    expect(screen.getByText('Kitchen 12')).toBeTruthy();
  });
});
