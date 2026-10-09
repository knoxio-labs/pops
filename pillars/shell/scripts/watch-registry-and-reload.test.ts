import { describe, expect, it } from 'vitest';

import { readConfig, renderWatchedConf } from './watch-registry-and-reload.js';

import type { DiscoveryTransport } from '@pops/pillar-sdk/client';

const EMPTY_REGISTRY: DiscoveryTransport = { fetchSnapshot: () => Promise.resolve([]) };

describe('readConfig', () => {
  it('falls back to documented defaults when env is empty', () => {
    const cfg = readConfig({});
    expect(cfg.registryUrl).toBe('http://registry-api:3001');
    expect(cfg.reloadCmd).toBe('nginx -s reload');
    expect(cfg.debounceMs).toBe(250);
    expect(cfg.backoffMs).toBe(1000);
    expect(cfg.validationFailureThreshold).toBe(1);
    expect(cfg.outputPath.endsWith('pillars/shell/nginx.conf')).toBe(true);
  });

  it('threads env overrides through', () => {
    const cfg = readConfig({
      CORE_REGISTRY_URL: 'http://alt:9000',
      POPS_NGINX_OUTPUT: '/tmp/foo.conf',
      POPS_NGINX_RELOAD_CMD: 'docker kill -s HUP nginx',
      POPS_NGINX_DEBOUNCE_MS: '500',
      POPS_NGINX_BACKOFF_MS: '2000',
      POPS_NGINX_VALIDATION_FAILURE_THRESHOLD: '4',
    });
    expect(cfg.registryUrl).toBe('http://alt:9000');
    expect(cfg.outputPath).toBe('/tmp/foo.conf');
    expect(cfg.reloadCmd).toBe('docker kill -s HUP nginx');
    expect(cfg.debounceMs).toBe(500);
    expect(cfg.backoffMs).toBe(2000);
    expect(cfg.validationFailureThreshold).toBe(4);
  });

  it('rejects non-positive integers and falls back to defaults', () => {
    const cfg = readConfig({
      POPS_NGINX_DEBOUNCE_MS: '-3',
      POPS_NGINX_BACKOFF_MS: 'abc',
      POPS_NGINX_VALIDATION_FAILURE_THRESHOLD: '0',
    });
    expect(cfg.debounceMs).toBe(250);
    expect(cfg.backoffMs).toBe(1000);
    expect(cfg.validationFailureThreshold).toBe(1);
  });

  it('leaves the guest gate inert when POPS_OPERATOR_EMAILS is absent', () => {
    expect(readConfig({}).guestGate).toEqual({});
  });

  it('carries POPS_OPERATOR_EMAILS into the guest gate', () => {
    const cfg = readConfig({ POPS_OPERATOR_EMAILS: 'owner@example.com' });
    expect(cfg.guestGate).toEqual({ operatorEmails: 'owner@example.com' });
  });
});

describe('renderWatchedConf', () => {
  it('re-renders with the operator list the watcher started with', async () => {
    const cfg = readConfig({ POPS_OPERATOR_EMAILS: 'owner@example.com' });
    const conf = await renderWatchedConf(cfg, EMPTY_REGISTRY);
    expect(conf).toContain('    default 1;\n    "" 0;\n    "owner@example.com" 0;\n}');
  });

  it('re-renders an inert gate when the watcher started without a list', async () => {
    const conf = await renderWatchedConf(readConfig({}), EMPTY_REGISTRY);
    expect(conf).toContain(
      'map $http_cf_access_authenticated_user_email $pops_guest {\n    default 0;\n}'
    );
    expect(conf).not.toContain('default 1;');
  });
});
