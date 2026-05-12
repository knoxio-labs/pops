/**
 * Tests for the glia.toml threshold loader (PRD-086 US-03 AC #7).
 *
 * Covers:
 * - toml file takes precedence over the settings DB
 * - missing/unreadable toml falls back to the settings DB
 * - mtime invalidation picks up in-process edits without restart
 */
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { closeDb, setDb } from '../../../../db.js';
import { createTestDb } from '../../../../shared/test-utils.js';
import { setRawSetting } from '../../../core/settings/service.js';
import { resetCerebrumCache } from '../../instance.js';
import { gliaTomlPath, loadGliaToml, resetGliaTomlCache } from '../toml-config.js';
import { getGliaThresholds } from '../types.js';

import type { Database } from 'better-sqlite3';

const ENV_KEY = 'ENGRAM_ROOT';

function writeGliaToml(root: string, body: string): void {
  const path = gliaTomlPath(root);
  mkdirSync(join(root, '.config'), { recursive: true });
  writeFileSync(path, body, 'utf8');
}

function bumpMtime(path: string, deltaSeconds: number): void {
  // utimesSync overrides atime/mtime so the loader's mtime check sees a change
  // even when two writes occur within the same millisecond.
  const now = Date.now() / 1000 + deltaSeconds;
  utimesSync(path, now, now);
}

describe('loadGliaToml', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'glia-toml-'));
    resetGliaTomlCache();
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
    resetGliaTomlCache();
  });

  it('returns an empty object when the file is absent', () => {
    expect(loadGliaToml(root)).toEqual({});
  });

  it('parses the [trust.graduation] section', () => {
    writeGliaToml(
      root,
      `
[trust.graduation]
propose_to_act_report_min_approved = 5
propose_to_act_report_max_rejection_rate = 0.25
act_report_to_silent_min_days = 14
demotion_revert_threshold = 3
demotion_window_days = 10
`
    );
    expect(loadGliaToml(root)).toEqual({
      proposeToActReportMinApproved: 5,
      proposeToActReportMaxRejectionRate: 0.25,
      actReportToSilentMinDays: 14,
      demotionRevertThreshold: 3,
      demotionWindowDays: 10,
    });
  });

  it('returns only the keys present in the toml file', () => {
    writeGliaToml(
      root,
      `
[trust.graduation]
propose_to_act_report_min_approved = 7
`
    );
    expect(loadGliaToml(root)).toEqual({ proposeToActReportMinApproved: 7 });
  });

  it('ignores non-numeric values', () => {
    writeGliaToml(
      root,
      `
[trust.graduation]
propose_to_act_report_min_approved = "not a number"
demotion_revert_threshold = 4
`
    );
    expect(loadGliaToml(root)).toEqual({ demotionRevertThreshold: 4 });
  });

  it('returns an empty object on malformed toml', () => {
    writeGliaToml(root, 'this is = = not valid toml [');
    expect(loadGliaToml(root)).toEqual({});
  });

  it('picks up file edits via mtime invalidation', () => {
    writeGliaToml(
      root,
      `
[trust.graduation]
propose_to_act_report_min_approved = 5
`
    );
    expect(loadGliaToml(root).proposeToActReportMinApproved).toBe(5);

    writeGliaToml(
      root,
      `
[trust.graduation]
propose_to_act_report_min_approved = 11
`
    );
    bumpMtime(gliaTomlPath(root), 10);

    expect(loadGliaToml(root).proposeToActReportMinApproved).toBe(11);
  });

  it('serves cached result while mtime is unchanged', () => {
    const path = gliaTomlPath(root);
    writeGliaToml(
      root,
      `
[trust.graduation]
propose_to_act_report_min_approved = 5
`
    );
    expect(loadGliaToml(root).proposeToActReportMinApproved).toBe(5);

    // Overwrite content but pin the mtime back to the original — the loader
    // should serve the cached value, not re-parse.
    const pinnedSeconds = 1_700_000_000;
    utimesSync(path, pinnedSeconds, pinnedSeconds);
    expect(loadGliaToml(root).proposeToActReportMinApproved).toBe(5);

    writeFileSync(
      path,
      `
[trust.graduation]
propose_to_act_report_min_approved = 99
`,
      'utf8'
    );
    utimesSync(path, pinnedSeconds, pinnedSeconds);
    expect(loadGliaToml(root).proposeToActReportMinApproved).toBe(5);
  });
});

describe('getGliaThresholds precedence', () => {
  let root: string;
  let db: Database;
  let originalEnv: string | undefined;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'glia-thresholds-'));
    originalEnv = process.env[ENV_KEY];
    process.env[ENV_KEY] = root;
    resetCerebrumCache();
    resetGliaTomlCache();
    db = createTestDb();
    setDb(db);
  });

  afterEach(() => {
    closeDb();
    rmSync(root, { recursive: true, force: true });
    if (originalEnv === undefined) delete process.env[ENV_KEY];
    else process.env[ENV_KEY] = originalEnv;
    resetCerebrumCache();
    resetGliaTomlCache();
  });

  it('returns hardcoded defaults when neither toml nor settings DB exist', () => {
    expect(getGliaThresholds()).toEqual({
      proposeToActReportMinApproved: 20,
      proposeToActReportMaxRejectionRate: 0.1,
      actReportToSilentMinDays: 60,
      demotionRevertThreshold: 2,
      demotionWindowDays: 7,
    });
  });

  it('falls back to settings DB when toml is absent', () => {
    setRawSetting('cerebrum.glia.proposeMinApproved', '42');
    setRawSetting('cerebrum.glia.demotionWindowDays', '21');

    const thresholds = getGliaThresholds();
    expect(thresholds.proposeToActReportMinApproved).toBe(42);
    expect(thresholds.demotionWindowDays).toBe(21);
    // Untouched keys keep the hardcoded fallback.
    expect(thresholds.actReportToSilentMinDays).toBe(60);
  });

  it('toml takes precedence over settings DB when both are present', () => {
    setRawSetting('cerebrum.glia.proposeMinApproved', '42');
    setRawSetting('cerebrum.glia.demotionWindowDays', '21');
    writeGliaToml(
      root,
      `
[trust.graduation]
propose_to_act_report_min_approved = 9
`
    );

    const thresholds = getGliaThresholds();
    // toml wins for keys it sets…
    expect(thresholds.proposeToActReportMinApproved).toBe(9);
    // …DB still wins per-key where toml is silent.
    expect(thresholds.demotionWindowDays).toBe(21);
  });

  it('hot-reload: editing glia.toml is observed on the next call', () => {
    writeGliaToml(
      root,
      `
[trust.graduation]
propose_to_act_report_min_approved = 5
`
    );
    expect(getGliaThresholds().proposeToActReportMinApproved).toBe(5);

    writeGliaToml(
      root,
      `
[trust.graduation]
propose_to_act_report_min_approved = 17
`
    );
    bumpMtime(gliaTomlPath(root), 10);

    expect(getGliaThresholds().proposeToActReportMinApproved).toBe(17);
  });
});
