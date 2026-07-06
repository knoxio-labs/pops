import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  discoverManifests,
  findViolations,
  matchImage,
  matchName,
  scanCompose,
  scanLitestream,
} from '../check-homelab-service-isolation.mjs';

describe('matchName', () => {
  it('matches every forbidden homelab service by its canonical name', () => {
    expect(matchName('home-assistant')?.id).toBe('home-assistant');
    expect(matchName('homeassistant')?.id).toBe('home-assistant');
    expect(matchName('hass')?.id).toBe('home-assistant');
    expect(matchName('mosquitto')?.id).toBe('mosquitto');
    expect(matchName('eclipse-mosquitto')?.id).toBe('mosquitto');
    expect(matchName('zigbee2mqtt')?.id).toBe('zigbee2mqtt');
    expect(matchName('z2m')?.id).toBe('zigbee2mqtt');
    expect(matchName('matter')?.id).toBe('matter');
    expect(matchName('matter-server')?.id).toBe('matter');
    expect(matchName('matterbridge')?.id).toBe('matter');
  });

  it('does not match pops-owned service names or partial collisions', () => {
    expect(matchName('finance-api')).toBeUndefined();
    expect(matchName('ha-bridge')).toBeUndefined();
    expect(matchName('ha-bridge-api')).toBeUndefined();
    expect(matchName('matterhorn')).toBeUndefined();
    expect(matchName('mosquitto-exporter')).toBeUndefined();
  });
});

describe('matchImage', () => {
  it('matches forbidden images across registries and tags', () => {
    expect(matchImage('ghcr.io/home-assistant/home-assistant:stable')?.id).toBe('home-assistant');
    expect(matchImage('homeassistant/home-assistant')?.id).toBe('home-assistant');
    expect(matchImage('eclipse-mosquitto:2')?.id).toBe('mosquitto');
    expect(matchImage('koenkk/zigbee2mqtt')?.id).toBe('zigbee2mqtt');
    expect(matchImage('ghcr.io/home-assistant-libs/python-matter-server:6')?.id).toBe('matter');
  });

  it('matches digest-pinned images (name@sha256:…) with no tag', () => {
    expect(matchImage('eclipse-mosquitto@sha256:cafe')?.id).toBe('mosquitto');
    expect(matchImage('ghcr.io/home-assistant/home-assistant@sha256:deadbeef')?.id).toBe(
      'home-assistant'
    );
    expect(matchImage('koenkk/zigbee2mqtt@sha256:beef')?.id).toBe('zigbee2mqtt');
  });

  it('does not match a pops-owned image that merely shares a substring', () => {
    expect(matchImage('ghcr.io/knoxio/pops-finance:main')).toBeUndefined();
    expect(matchImage('ghcr.io/knoxio/pops-ha-bridge:main')).toBeUndefined();
    expect(matchImage('ghcr.io/knoxio/pops-finance@sha256:abc')).toBeUndefined();
  });
});

describe('scanCompose', () => {
  it('flags a forbidden service by its immediate service key', () => {
    const text = ['services:', '  home-assistant:', '    image: whatever'].join('\n');
    const v = scanCompose('infra/compose.yml', text);
    expect(v).toContainEqual(
      expect.objectContaining({ service: 'Home Assistant', kind: 'service-key', line: 2 })
    );
  });

  it('flags a forbidden image and container_name regardless of the service key', () => {
    const text = [
      'services:',
      '  broker:',
      '    image: eclipse-mosquitto:2',
      '    container_name: mosquitto',
    ].join('\n');
    const v = scanCompose('infra/compose.yml', text);
    expect(v.filter((x) => x.kind === 'image')).toHaveLength(1);
    expect(v.filter((x) => x.kind === 'container_name')).toHaveLength(1);
    expect(v.every((x) => x.service === 'Mosquitto MQTT broker')).toBe(true);
  });

  it('flags the z2m alias and the matter-server image', () => {
    const text = [
      'services:',
      '  z2m:',
      '    image: koenkk/zigbee2mqtt',
      '  matter:',
      '    image: ghcr.io/home-assistant-libs/python-matter-server:6',
    ].join('\n');
    const services = new Set(scanCompose('c.yml', text).map((x) => x.service));
    expect(services.has('Zigbee2MQTT')).toBe(true);
    expect(services.has('Matter server')).toBe(true);
  });

  it('flags forbidden services declared with quoted YAML keys', () => {
    const text = [
      'services:',
      '  "home-assistant":',
      '    image: whatever',
      "  'mosquitto':",
      '    image: eclipse-mosquitto@sha256:cafe',
    ].join('\n');
    const v = scanCompose('infra/compose.yml', text);
    expect(v).toContainEqual(
      expect.objectContaining({ service: 'Home Assistant', kind: 'service-key' })
    );
    expect(v).toContainEqual(
      expect.objectContaining({ service: 'Mosquitto MQTT broker', kind: 'service-key' })
    );
    expect(v).toContainEqual(
      expect.objectContaining({ service: 'Mosquitto MQTT broker', kind: 'image' })
    );
  });

  it('does NOT flag a forbidden name that appears only as a nested mapping key (not a service)', () => {
    const text = [
      'services:',
      '  app:',
      '    image: ghcr.io/knoxio/pops-ha-bridge:main',
      '    environment:',
      '      matter: enabled',
      '      home-assistant: http://homelab:8123',
    ].join('\n');
    expect(scanCompose('c.yml', text)).toEqual([]);
  });

  it('does NOT flag a forbidden service declared under a non-services top-level block', () => {
    const text = [
      'networks:',
      '  mosquitto:',
      '    driver: bridge',
      'services:',
      '  finance-api:',
      '    image: ghcr.io/knoxio/pops-finance:main',
    ].join('\n');
    expect(scanCompose('c.yml', text)).toEqual([]);
  });

  it('does NOT flag pops services or prose mentioning the boundary', () => {
    const text = [
      '# ha-bridge talks to an upstream Home Assistant over its API but never',
      '# runs mosquitto / zigbee2mqtt / matter as pops services (ADR-039 Inv 4).',
      'services:',
      '  ha-bridge-api:',
      '    image: ghcr.io/knoxio/pops-ha-bridge:main',
      '  finance-api:',
      '    image: ghcr.io/knoxio/pops-finance:main',
    ].join('\n');
    expect(scanCompose('c.yml', text)).toEqual([]);
  });

  it('ignores a forbidden token that only appears in a trailing comment', () => {
    const text = [
      'services:',
      '  finance-api: # not mosquitto, not home-assistant',
      '    image: ghcr.io/knoxio/pops-finance:main # not eclipse-mosquitto',
    ].join('\n');
    expect(scanCompose('c.yml', text)).toEqual([]);
  });
});

describe('scanLitestream', () => {
  it('flags a forbidden service brought onto the pops Litestream convention by db path', () => {
    const text = ['dbs:', '  - path: /data/sqlite/mosquitto.db'].join('\n');
    const v = scanLitestream('litestream/finance.yml', text);
    expect(v).toContainEqual(
      expect.objectContaining({ service: 'Mosquitto MQTT broker', kind: 'litestream-path' })
    );
  });

  it('flags a litestream config file named for a forbidden service', () => {
    const v = scanLitestream('litestream/home-assistant.yml', 'dbs: []');
    expect(v).toContainEqual(expect.objectContaining({ kind: 'litestream-file', line: 0 }));
  });

  it('leaves a legitimate per-pillar litestream config clean', () => {
    const text = ['dbs:', '  - path: /data/sqlite/finance.db'].join('\n');
    expect(scanLitestream('litestream/finance.yml', text)).toEqual([]);
  });
});

describe('discoverManifests + findViolations (filesystem round-trip)', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'homelab-iso-test-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('discovers compose + litestream manifests and reports leaks with repo-relative paths', () => {
    const infra = join(dir, 'infra');
    mkdirSync(join(infra, 'litestream'), { recursive: true });
    writeFileSync(
      join(infra, 'docker-compose.yml'),
      ['services:', '  home-assistant:', '    image: ghcr.io/home-assistant/home-assistant'].join(
        '\n'
      )
    );
    writeFileSync(
      join(infra, 'litestream', 'finance.yml'),
      ['dbs:', '  - path: /data/sqlite/zigbee2mqtt.db'].join('\n')
    );

    const manifests = discoverManifests(dir);
    expect(manifests.some((m) => m.kind === 'compose')).toBe(true);
    expect(manifests.some((m) => m.kind === 'litestream')).toBe(true);

    const violations = findViolations(manifests, (p) => readFileSync(p, 'utf8'), dir);
    const services = new Set(violations.map((v) => v.service));
    expect(services.has('Home Assistant')).toBe(true);
    expect(services.has('Zigbee2MQTT')).toBe(true);
    expect(violations.every((v) => !v.file.startsWith('/'))).toBe(true);
  });

  it('reports zero violations for a clean pops infra tree', () => {
    mkdirSync(join(dir, 'infra'), { recursive: true });
    writeFileSync(
      join(dir, 'infra', 'docker-compose.yml'),
      ['services:', '  finance-api:', '    image: ghcr.io/knoxio/pops-finance:main'].join('\n')
    );
    const manifests = discoverManifests(dir);
    expect(findViolations(manifests, (p) => readFileSync(p, 'utf8'), dir)).toEqual([]);
  });

  it('skips node_modules and other build dirs during discovery', () => {
    const nm = join(dir, 'node_modules', 'some-pkg');
    mkdirSync(nm, { recursive: true });
    writeFileSync(
      join(nm, 'docker-compose.yml'),
      ['services:', '  mosquitto:', '    image: eclipse-mosquitto'].join('\n')
    );
    expect(discoverManifests(dir)).toEqual([]);
  });

  it('skips hidden directories (.cache, .venv, …) except .github', () => {
    const hidden = join(dir, '.cache');
    mkdirSync(hidden, { recursive: true });
    writeFileSync(
      join(hidden, 'docker-compose.yml'),
      ['services:', '  mosquitto:', '    image: eclipse-mosquitto'].join('\n')
    );
    expect(discoverManifests(dir)).toEqual([]);
  });
});
