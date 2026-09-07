#!/usr/bin/env node
// Fails if any package in REQUIRED_TEST_PACKAGES is missing a "test" script.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const REQUIRED_TEST_PACKAGES = [
  'apps/api',
  'apps/web',
  'apps/worker',
];

const root = new URL('..', import.meta.url).pathname;
let failed = false;

for (const pkg of REQUIRED_TEST_PACKAGES) {
  const pkgJson = JSON.parse(readFileSync(resolve(root, pkg, 'package.json'), 'utf8'));
  if (!pkgJson.scripts?.test) {
    console.error(`ERROR: ${pkg}/package.json is missing a "test" script.`);
    failed = true;
  }
}

if (failed) process.exit(1);
console.log('All required packages have a test script.');
