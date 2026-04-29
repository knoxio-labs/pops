import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return { ...actual, existsSync: vi.fn() };
});

import { existsSync } from 'node:fs';

import { DEFAULT_SQLITE_PATH, resolveSqlitePath } from './sqlite-path.js';

const mockExistsSync = vi.mocked(existsSync);

describe('resolveSqlitePath', () => {
  afterEach(() => {
    delete process.env['SQLITE_PATH'];
    vi.clearAllMocks();
  });

  it('returns SQLITE_PATH when env var is set', () => {
    process.env['SQLITE_PATH'] = '/custom/path/pops.db';
    expect(resolveSqlitePath()).toBe('/custom/path/pops.db');
    expect(mockExistsSync).not.toHaveBeenCalled();
  });

  it('returns fallback and logs warning when env unset and fallback path exists', () => {
    mockExistsSync.mockReturnValue(true);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = resolveSqlitePath();

    expect(result).toBe(DEFAULT_SQLITE_PATH);
    expect(mockExistsSync).toHaveBeenCalledWith(DEFAULT_SQLITE_PATH);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('SQLITE_PATH not set'));
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining(DEFAULT_SQLITE_PATH));
  });

  it('throws with actionable message when env unset and fallback path missing', () => {
    mockExistsSync.mockReturnValue(false);

    expect(() => resolveSqlitePath()).toThrow('SQLITE_PATH is not set');
    expect(() => resolveSqlitePath()).toThrow(DEFAULT_SQLITE_PATH);
    expect(() => resolveSqlitePath()).toThrow('Copy apps/pops-api/.env.example');
  });
});
