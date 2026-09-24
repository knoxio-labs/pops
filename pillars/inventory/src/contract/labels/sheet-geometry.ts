/**
 * Checking a sheet a person measured by hand before anything prints on it.
 */
import { z } from 'zod';

import { A4_HEIGHT_MM, A4_WIDTH_MM } from './sheet-layouts.js';

import type { SheetGeometry } from './sheet-layouts.js';

const EPSILON_MM = 0.01;

/** The geometry of a layout, without its name or scale. */
export function geometryOf(layout: SheetGeometry): SheetGeometry {
  const {
    columns,
    rows,
    labelWidthMm,
    labelHeightMm,
    marginTopMm,
    marginLeftMm,
    pitchXMm,
    pitchYMm,
  } = layout;
  return {
    columns,
    rows,
    labelWidthMm,
    labelHeightMm,
    marginTopMm,
    marginLeftMm,
    pitchXMm,
    pitchYMm,
  };
}

function countProblems({ columns, rows }: SheetGeometry): string[] {
  const problems: string[] = [];
  if (!Number.isInteger(columns) || columns < 1 || columns > 10) {
    problems.push('Labels across must be a whole number from 1 to 10.');
  }
  if (!Number.isInteger(rows) || rows < 1 || rows > 40) {
    problems.push('Labels down must be a whole number from 1 to 40.');
  }
  return problems;
}

function measureProblems(geometry: SheetGeometry): string[] {
  const { labelWidthMm, labelHeightMm, marginTopMm, marginLeftMm, pitchXMm, pitchYMm } = geometry;
  const measures = [labelWidthMm, labelHeightMm, marginTopMm, marginLeftMm, pitchXMm, pitchYMm];
  if (measures.some((value) => !Number.isFinite(value)))
    return ['Every measurement needs a number.'];
  const problems: string[] = [];
  if (labelWidthMm <= 0 || labelHeightMm <= 0) problems.push('Labels need a width and a height.');
  if (marginTopMm < 0 || marginLeftMm < 0) problems.push('Margins cannot be negative.');
  if (geometry.columns > 1 && pitchXMm + EPSILON_MM < labelWidthMm) {
    problems.push('Across pitch must be at least the label width, or labels overlap.');
  }
  if (geometry.rows > 1 && pitchYMm + EPSILON_MM < labelHeightMm) {
    problems.push('Down pitch must be at least the label height, or labels overlap.');
  }
  return problems;
}

function overflowProblems(geometry: SheetGeometry): string[] {
  const right =
    geometry.marginLeftMm + (geometry.columns - 1) * geometry.pitchXMm + geometry.labelWidthMm;
  const bottom =
    geometry.marginTopMm + (geometry.rows - 1) * geometry.pitchYMm + geometry.labelHeightMm;
  const problems: string[] = [];
  if (right > A4_WIDTH_MM + EPSILON_MM) {
    problems.push(`The labels run ${(right - A4_WIDTH_MM).toFixed(1)} mm off the right edge.`);
  }
  if (bottom > A4_HEIGHT_MM + EPSILON_MM) {
    problems.push(`The labels run ${(bottom - A4_HEIGHT_MM).toFixed(1)} mm off the bottom edge.`);
  }
  return problems;
}

/**
 * Why a hand-described sheet cannot be printed on, in the words the form
 * shows; empty when it can. A sheet must have whole rows and columns, labels
 * that do not overlap, and a grid that stays on the A4 page.
 */
export function sheetGeometryProblems(geometry: SheetGeometry): string[] {
  const problems = [...countProblems(geometry), ...measureProblems(geometry)];
  return problems.length > 0 ? problems : overflowProblems(geometry);
}

const StoredSheet = z.object({
  columns: z.number(),
  rows: z.number(),
  labelWidthMm: z.number(),
  labelHeightMm: z.number(),
  marginTopMm: z.number(),
  marginLeftMm: z.number(),
  pitchXMm: z.number(),
  pitchYMm: z.number(),
}) satisfies z.ZodType<SheetGeometry>;

function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Reads a sheet geometry back from its JSON form (what a browser stored for
 * the custom sheet), or null when it is absent, malformed or no longer
 * printable.
 */
export function parseSheetGeometry(raw: string | null): SheetGeometry | null {
  if (raw === null) return null;
  const parsed = StoredSheet.safeParse(parseJson(raw));
  if (!parsed.success) return null;
  return sheetGeometryProblems(parsed.data).length === 0 ? parsed.data : null;
}
