import { describe, expect, it } from 'vitest';

import {
  mapMovieDetail,
  mapMovieResult,
  mapSearchResponse,
  stripSurroundingQuotes,
} from './client-mappers.js';

import type { RawTmdbMovieDetail, RawTmdbSearchResponse } from './types.js';

describe('stripSurroundingQuotes', () => {
  it('strips surrounding double-quotes', () => {
    expect(stripSurroundingQuotes('"Wuthering Heights"')).toBe('Wuthering Heights');
  });

  it('strips multiple surrounding double-quotes', () => {
    expect(stripSurroundingQuotes('""Fight Club""')).toBe('Fight Club');
  });

  it('leaves a clean title unchanged', () => {
    expect(stripSurroundingQuotes('The Dark Knight')).toBe('The Dark Knight');
  });

  it('only strips surrounding quotes, not interior ones', () => {
    expect(stripSurroundingQuotes('"Say "Hello""')).toBe('Say "Hello"');
  });

  it('trims surrounding whitespace after stripping', () => {
    expect(stripSurroundingQuotes('"  Pulp Fiction  "')).toBe('Pulp Fiction');
  });

  it('returns empty string unchanged', () => {
    expect(stripSurroundingQuotes('')).toBe('');
  });
});

const rawResult: RawTmdbSearchResponse['results'][number] = {
  id: 550,
  title: '"Fight Club"',
  original_title: '"Fight Club"',
  overview: 'An insomniac office worker...',
  release_date: '1999-10-15',
  poster_path: '/poster.jpg',
  backdrop_path: '/backdrop.jpg',
  vote_average: 8.4,
  vote_count: 25000,
  genre_ids: [18, 53],
  original_language: 'en',
  popularity: 55.3,
};

describe('mapMovieResult', () => {
  it('strips surrounding quotes from title and originalTitle', () => {
    const mapped = mapMovieResult(rawResult);
    expect(mapped.title).toBe('Fight Club');
    expect(mapped.originalTitle).toBe('Fight Club');
  });

  it('leaves a clean title unchanged', () => {
    const mapped = mapMovieResult({
      ...rawResult,
      title: 'Pulp Fiction',
      original_title: 'Pulp Fiction',
    });
    expect(mapped.title).toBe('Pulp Fiction');
    expect(mapped.originalTitle).toBe('Pulp Fiction');
  });
});

const rawSearchResponse: RawTmdbSearchResponse = {
  page: 1,
  total_results: 1,
  total_pages: 1,
  results: [rawResult],
};

describe('mapSearchResponse', () => {
  it('strips quotes from all result titles', () => {
    const mapped = mapSearchResponse(rawSearchResponse);
    expect(mapped.results[0]!.title).toBe('Fight Club');
    expect(mapped.results[0]!.originalTitle).toBe('Fight Club');
  });
});

const rawDetail: RawTmdbMovieDetail = {
  id: 550,
  imdb_id: 'tt0137523',
  title: '"Fight Club"',
  original_title: '"Fight Club"',
  overview: 'An insomniac office worker...',
  tagline: 'Mischief. Mayhem. Soap.',
  release_date: '1999-10-15',
  runtime: 139,
  status: 'Released',
  original_language: 'en',
  budget: 63000000,
  revenue: 101200000,
  poster_path: '/poster.jpg',
  backdrop_path: '/backdrop.jpg',
  vote_average: 8.4,
  vote_count: 25000,
  genres: [{ id: 18, name: 'Drama' }],
  production_companies: [{ id: 508, name: 'Regency Enterprises' }],
  spoken_languages: [{ iso_639_1: 'en', name: 'English' }],
};

describe('mapMovieDetail', () => {
  it('strips surrounding quotes from title and originalTitle', () => {
    const mapped = mapMovieDetail(rawDetail);
    expect(mapped.title).toBe('Fight Club');
    expect(mapped.originalTitle).toBe('Fight Club');
  });

  it('leaves a clean title unchanged', () => {
    const mapped = mapMovieDetail({
      ...rawDetail,
      title: 'Pulp Fiction',
      original_title: 'Pulp Fiction',
    });
    expect(mapped.title).toBe('Pulp Fiction');
    expect(mapped.originalTitle).toBe('Pulp Fiction');
  });
});
