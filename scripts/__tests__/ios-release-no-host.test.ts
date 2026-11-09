import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { delimiter, join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const config = readFileSync(resolve('clients/ios/mise.toml'), 'utf8');
const task = config.match(
  /\[tasks\."verify:release-carries-no-host"\][\s\S]*?run = '''([\s\S]*?)'''/
)?.[1];

const xcodebuild = `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const args = process.argv.slice(2);
const option = (name) => args[args.indexOf(name) + 1];
const scheme = option('-scheme');
const fault = scheme === process.env.TRIPS_RELEASE_SCHEME ? process.env.TRIPS_RELEASE_FAULT : 'none';
const debug = 'http://debug.invalid/' + scheme;
if (args.includes('-showBuildSettings')) {
  fs.appendFileSync(process.env.TRIPS_RELEASE_LOG, 'debug:' + scheme + '\\n');
  if (fault !== 'missing-debug') console.log('    POPS_BFM_BASE_URL = ' + debug);
  process.exit(0);
}
fs.appendFileSync(process.env.TRIPS_RELEASE_LOG, 'build:' + scheme + '\\n');
if (fault === 'build-fails') {
  console.error('fixture build failed');
  process.exit(1);
}
const app = path.join(option('-derivedDataPath'), 'Build/Products/Release-iphonesimulator', scheme + '.app');
fs.mkdirSync(app, { recursive: true });
const plist = fault === 'missing-key' ? {} : { POPSBFMBaseURL: fault === 'baked-host' ? debug : '' };
fs.writeFileSync(path.join(app, 'Info.plist'), JSON.stringify(plist));
fs.writeFileSync(path.join(app, 'fixture-binary'), fault === 'binary-host' ? debug : 'no host');
`;

const plutil = `#!/usr/bin/env node
const fs = require('node:fs');
const plist = JSON.parse(fs.readFileSync(process.argv.at(-1), 'utf8'));
if (!Object.hasOwn(plist, 'POPSBFMBaseURL')) process.exit(1);
process.stdout.write(plist.POPSBFMBaseURL);
`;

function runCheck(fault = 'none', scheme = 'PopsTrips') {
  if (task === undefined) throw new Error('Release host verification task is missing.');
  const temporaryRoot = resolve('tmp');
  mkdirSync(temporaryRoot, { recursive: true });
  const fixture = mkdtempSync(join(temporaryRoot, 'trips-release-'));
  const log = join(fixture, 'commands');
  try {
    writeFileSync(join(fixture, 'xcodebuild'), xcodebuild, { mode: 0o755 });
    writeFileSync(join(fixture, 'plutil'), plutil, { mode: 0o755 });
    const result = spawnSync('bash', ['-c', task], {
      cwd: fixture,
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: fixture + delimiter + (process.env.PATH ?? ''),
        TMPDIR: fixture,
        TRIPS_RELEASE_FAULT: fault,
        TRIPS_RELEASE_SCHEME: scheme,
        TRIPS_RELEASE_LOG: log,
      },
    });
    return {
      status: result.status,
      output: result.stdout + result.stderr,
      commands: existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n') : [],
    };
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
}

describe('Release BFM host verification', () => {
  it('builds and inspects both applications using each Debug configuration', () => {
    const result = runCheck();
    expect(result.status).toBe(0);
    expect(result.commands).toEqual([
      'debug:Pops',
      'build:Pops',
      'debug:PopsTrips',
      'build:PopsTrips',
    ]);
    expect(result.output).toContain('Pops Release build names no BFM host.');
    expect(result.output).toContain('PopsTrips Release build names no BFM host.');
  });

  for (const scheme of ['Pops', 'PopsTrips']) {
    it.each([
      ['missing-debug', 'Debug defines no POPS_BFM_BASE_URL'],
      ['build-fails', 'fixture build failed'],
      ['missing-key', 'Release Info.plist carries no POPSBFMBaseURL key'],
      ['baked-host', 'Release bakes a BFM host into Info.plist'],
      ['binary-host', 'Release build carries the Debug BFM host'],
    ])('rejects %s in ' + scheme, (fault, message) => {
      const result = runCheck(fault, scheme);
      expect(result.status).toBe(1);
      expect(result.output).toContain(message);
      expect(result.output).not.toContain(scheme + ' Release build names no BFM host.');
    });
  }
});
