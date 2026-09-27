import assert from 'node:assert/strict';

const lanes = [
  'quality',
  'units',
  'apps',
  'rust',
  'frontend',
  'browser',
  'images',
  'registry',
  'ios',
];

/** Require every full-validation lane to succeed; ordinary PRs retain their affected checks.
 * @param {boolean} required
 * @param {Record<string, {result: string}>} results
 * @returns {string[]}
 */
export function promotionFailures(required, results) {
  if (!required) return [];
  return lanes.filter((lane) => results[lane]?.result !== 'success');
}

/** Parse workflow inputs strictly so missing or malformed wiring cannot waive admission.
 * @param {string | undefined} required
 * @param {string | undefined} rawResults
 * @returns {string[]}
 */
export function checkPromotionEnvironment(required, rawResults) {
  if (required !== 'true' && required !== 'false') {
    throw new Error('PROMOTION_REQUIRED must be true or false.');
  }
  if (!rawResults) throw new Error('PROMOTION_RESULTS is required.');
  /** @type {unknown} */
  const parsed = JSON.parse(rawResults);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('PROMOTION_RESULTS must be an object.');
  }
  /** @type {Record<string, {result: string}>} */
  const results = {};
  for (const [lane, verdict] of Object.entries(parsed)) {
    if (!verdict || typeof verdict !== 'object' || typeof verdict.result !== 'string') {
      throw new Error(`Missing lane result: ${lane}`);
    }
    results[lane] = { result: verdict.result };
  }
  return promotionFailures(required === 'true', results);
}

if (import.meta.main && process.argv.includes('--self-test')) {
  const success = Object.fromEntries(lanes.map((lane) => [lane, { result: 'success' }]));
  assert.deepEqual(promotionFailures(true, success), []);
  assert.deepEqual(promotionFailures(true, {}), lanes);
  assert.deepEqual(promotionFailures(false, {}), []);
  for (const lane of lanes) {
    for (const result of ['failure', 'cancelled', 'skipped', 'pending', '']) {
      assert.deepEqual(promotionFailures(true, { ...success, [lane]: { result } }), [lane]);
    }
  }
  console.log('Promotion validation self-test passed.');
} else if (import.meta.main) {
  const failures = checkPromotionEnvironment(
    process.env.PROMOTION_REQUIRED,
    process.env.PROMOTION_RESULTS
  );
  if (failures.length) {
    console.error(`Promotion validation failed: ${failures.join(', ')}`);
    process.exitCode = 1;
  } else {
    console.log(
      process.env.PROMOTION_REQUIRED === 'true'
        ? 'All promotion lanes passed.'
        : 'Ordinary PR: affected checks apply.'
    );
  }
}
