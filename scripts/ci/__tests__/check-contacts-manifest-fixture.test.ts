/**
 * Cross-language drift check for the Rust contacts manifest (POPS-2592).
 *
 * `pillars/contacts/src/manifest.rs` hand-writes `ManifestPayload` as a
 * `serde_json::Value` because Rust cannot import
 * `libs/sdk/src/manifest-schema/schema.ts` — the schema `bootstrapPillar`
 * actually runs on register, and a rejected manifest fails boot loudly (a
 * non-retriable 400; POPS-2581 is what that looks like for a TS pillar,
 * and contacts' own README records the Rust equivalent: it just never
 * appears in the registry). `check-manifest-payload-coverage.mjs`
 * (POPS-2585) cannot see this at all — it only reads `.ts`/`.tsx` — so
 * nothing else in the repo runs the built manifest through the real
 * validator.
 *
 * `pillars/contacts/tests/manifest_fixture.rs` is the other half: it builds
 * the manifest with `build_contacts_manifest` and compares the pretty-printed
 * JSON to `pillars/contacts/tests/fixtures/manifest.json`, failing (and
 * naming `UPDATE_MANIFEST_FIXTURE=1`) when the Rust code no longer agrees
 * with the committed file. This test is the other side of that same file: it
 * parses the fixture with the real `validateManifestPayload` — schema shape
 * plus the cross-field rules a type cannot express (contract tag vs version,
 * search adapter procedurePath vs declared routes) — so a fixture that
 * still matches the Rust code but no longer matches the wire contract is
 * caught here rather than at boot in production.
 *
 * Neither half alone closes the gap: the Rust test only proves the fixture
 * matches manifest.rs, and this test only proves the fixture (whatever it
 * currently says) is schema-valid. Together they prove manifest.rs's actual
 * output is schema-valid, without either language reading the other's code.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { validateManifestPayload } from '@pops/pillar-sdk/manifest-schema';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..', '..');
const fixturePath = resolve(repoRoot, 'pillars/contacts/tests/fixtures/manifest.json');

describe('the committed contacts manifest fixture', () => {
  it('exists and is parseable JSON', () => {
    const raw = readFileSync(fixturePath, 'utf8');
    expect(() => JSON.parse(raw)).not.toThrow();
  });

  it('passes the SDK wire validator the registry bootstrap uses', () => {
    const fixture: unknown = JSON.parse(readFileSync(fixturePath, 'utf8'));

    const result = validateManifestPayload(fixture);

    // Printed on failure via the array assertion below: `issues` carries
    // `{ field, reason, got, schemaPath }` per problem, which is what a
    // developer regenerating the fixture with a broken `manifest.rs` needs to
    // see, rather than a bare "expected true, got false".
    expect(result.ok ? [] : result.issues).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('declares the contacts pillar id', () => {
    const fixture = JSON.parse(readFileSync(fixturePath, 'utf8')) as { pillar?: unknown };
    expect(fixture.pillar).toBe('contacts');
  });
});
