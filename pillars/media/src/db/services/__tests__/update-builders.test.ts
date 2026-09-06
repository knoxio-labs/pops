/**
 * PATCH semantics for the movie and TV-show update builders.
 *
 * Three states have to stay distinct, and only two of them were covered
 * anywhere: a field the caller omitted is left alone, a field set to `null` is
 * cleared, and a field set to a value is written. Collapsing the first two —
 * which is what an update loop without an `undefined` check does — silently
 * wipes every field a PATCH did not mention.
 *
 * Written because that mutation survived the whole media suite (664 tests)
 * while POPS-3029 was retyping those builders off their `Record<string,
 * unknown>` staging bags. Per POPS-2496's closing note: a behaviour-preserving
 * retype is exactly the change a green suite can sleep through, so the
 * behaviour needs pinning before the retype is believed.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openMediaDb, type OpenedMediaDb } from '../../open-media-db.js';
import { createMovie, updateMovie } from '../movies.js';
import { createTvShow, updateTvShow } from '../tv-shows.js';

let tmpDir: string;
let opened: OpenedMediaDb;
let tmdbSeq = 900_000;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'media-update-builders-test-'));
  opened = openMediaDb(join(tmpDir, 'media.db'));
});

afterEach(() => {
  opened.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('buildMovieUpdate — PATCH semantics', () => {
  function aMovie() {
    tmdbSeq += 1;
    return createMovie(opened.db, {
      tmdbId: tmdbSeq,
      title: 'Arrival',
      tagline: 'Why are they here?',
      overview: 'Linguist meets heptapods.',
      runtime: 116,
      voteAverage: 7.9,
    });
  }

  it('leaves an omitted string field alone', () => {
    const created = aMovie();
    const updated = updateMovie(opened.db, created.id, { title: 'Arrival (2016)' });

    expect(updated.title).toBe('Arrival (2016)');
    expect(updated.tagline).toBe('Why are they here?');
    expect(updated.overview).toBe('Linguist meets heptapods.');
  });

  it('leaves an omitted number field alone', () => {
    const created = aMovie();
    const updated = updateMovie(opened.db, created.id, { title: 'Arrival (2016)' });

    expect(updated.runtime).toBe(116);
    expect(updated.voteAverage).toBe(7.9);
  });

  it('clears a field the caller explicitly set to null', () => {
    const created = aMovie();
    const updated = updateMovie(opened.db, created.id, { tagline: null, runtime: null });

    expect(updated.tagline).toBeNull();
    expect(updated.runtime).toBeNull();
    expect(updated.overview).toBe('Linguist meets heptapods.');
  });
});

describe('buildTvShowUpdate — PATCH semantics', () => {
  function aShow() {
    tmdbSeq += 1;
    return createTvShow(opened.db, {
      tvdbId: tmdbSeq,
      name: 'Severance',
      overview: 'Work-life balance, surgically.',
      originalLanguage: 'en',
      numberOfSeasons: 2,
      voteAverage: 8.7,
    });
  }

  it('leaves an omitted string field alone', () => {
    const created = aShow();
    const updated = updateTvShow(opened.db, created.id, { name: 'Severance (2022)' });

    expect(updated.name).toBe('Severance (2022)');
    expect(updated.overview).toBe('Work-life balance, surgically.');
    expect(updated.originalLanguage).toBe('en');
  });

  it('leaves an omitted number field alone', () => {
    const created = aShow();
    const updated = updateTvShow(opened.db, created.id, { name: 'Severance (2022)' });

    expect(updated.numberOfSeasons).toBe(2);
    expect(updated.voteAverage).toBe(8.7);
  });

  it('clears a field the caller explicitly set to null', () => {
    const created = aShow();
    const updated = updateTvShow(opened.db, created.id, {
      overview: null,
      numberOfSeasons: null,
    });

    expect(updated.overview).toBeNull();
    expect(updated.numberOfSeasons).toBeNull();
    expect(updated.originalLanguage).toBe('en');
  });
});
