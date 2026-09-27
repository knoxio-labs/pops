#!/usr/bin/env node

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const iosRoot = resolve(scriptDirectory, '..');

function featureSources(root) {
  const files = [];
  for (const entry of readdirSync(join(root, 'Packages'), { withFileTypes: true })) {
    if (!entry.isDirectory() || !entry.name.startsWith('Feature')) continue;
    const sources = join(root, 'Packages', entry.name, 'Sources');
    walk(sources, files);
  }
  return files.toSorted();
}

function walk(directory, files) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      walk(path, files);
    } else if (entry.isFile() && entry.name.endsWith('.swift')) {
      files.push(path);
    }
  }
}

function codeOnly(source) {
  const ignoredToken = /"""[\s\S]*?"""|"(?:\\.|[^"\\])*"|\/\/[^\n]*|\/\*[\s\S]*?\*\//gu;
  return source.replace(ignoredToken, (token) => token.replace(/[^\n]/gu, ' '));
}

function repositoryReceivers(source) {
  const receivers = new Set();
  const declaration =
    /\b([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(?:any\s+)?(?:[A-Za-z_][A-Za-z0-9_]*\.)*[A-Za-z_][A-Za-z0-9_]*Repository\b/gu;
  for (const match of source.matchAll(declaration)) {
    const receiver = match[1];
    if (receiver !== undefined) receivers.add(receiver);
  }
  return receivers;
}

function violations(source) {
  const code = codeOnly(source);
  const receivers = repositoryReceivers(code);
  const hits = [];
  const call = /\btry\s*\?\s*await\s+(?:self\s*\.\s*)?([A-Za-z_][A-Za-z0-9_]*)\s*\??\s*\./gu;

  for (const match of code.matchAll(call)) {
    const receiver = match[1];
    if (receiver === undefined) continue;
    if (!receivers.has(receiver) && !receiver.toLowerCase().endsWith('repository')) continue;
    const offset = match.index ?? 0;
    const line = code.slice(0, offset).split('\n').length;
    hits.push({ line, receiver });
  }
  return hits;
}

function selfTest() {
  const failing = [
    `private let repository: any PurchasesRepository\nfunc save() async { _ = try? await repository.save() }`,
    `func load(client: any AccountsRepository) async {\n  _ = try?\n    await client.accounts()\n}`,
    `func load() async { _ = try? await purchasesRepository.search() }`,
    `private let repository: any PurchasesRepository\nfunc load() async { _ = try? await self.repository.search() }`,
  ];
  const passing = [
    `private let repository: any PurchasesRepository\nfunc save() async throws { _ = try await repository.save() }`,
    `func photo(store: InventoryStore) async { _ = try? await store.photo() }`,
    `func wait() async { try? await Task.sleep(for: .seconds(1)) }`,
    `// try? await purchasesRepository.search()\nlet text = "try? await repository.search()"`,
    `let text = "escaped \\" try? await purchasesRepository.search()"`,
  ];

  const failures = [];
  failing.forEach((source, index) => {
    if (violations(source).length !== 1) failures.push(`missed violation ${index + 1}`);
  });
  passing.forEach((source, index) => {
    if (violations(source).length !== 0) failures.push(`false positive ${index + 1}`);
  });

  if (failures.length > 0) {
    console.error(`check-feature-repository-try self-test failed: ${failures.join('; ')}`);
    process.exitCode = 1;
    return;
  }
  process.stdout.write('check-feature-repository-try self-test passed\n');
}

function check() {
  const files = featureSources(iosRoot);
  if (files.length === 0) {
    console.error('check-feature-repository-try: no Feature package Swift sources found');
    process.exitCode = 1;
    return;
  }

  const hits = [];
  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    for (const hit of violations(source)) {
      hits.push(
        `${relative(iosRoot, file)}:${hit.line}: try? discards an awaited repository failure`
      );
    }
  }

  if (hits.length > 0) {
    console.error(hits.join('\n'));
    console.error(
      'Handle the repository error explicitly and route user-visible failures through ErrorPresenter.'
    );
    process.exitCode = 1;
    return;
  }
  process.stdout.write(
    `check-feature-repository-try: checked ${files.length} Swift source files\n`
  );
}

const mode = process.argv[2];
if (mode === '--self-test') {
  selfTest();
} else if (mode === undefined) {
  check();
} else {
  console.error('usage: check-feature-repository-try.mjs [--self-test]');
  process.exitCode = 2;
}
