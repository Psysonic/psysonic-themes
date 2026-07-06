#!/usr/bin/env node
// Enforce a manifest version bump when an existing theme's files change.
//
// The in-app theme store detects updates by comparing `manifest.version`
// (semver, via the app's `isNewer`). If a contributor edits theme.css but
// leaves the version untouched, the store never offers the update. This check
// runs in the `validate` workflow on PRs and fails when a changed theme folder
// did not bump its version. Brand-new themes are exempt.
//
// Exempt too: a change whose only difference is the `changelog` field — pure
// release-note documentation ships no functional change, so forcing a bump
// would just push a spurious "update available" for identical CSS.
import { readFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const base = process.env.GITHUB_BASE_REF || 'main';

function sh(cmd) {
  return execSync(cmd, { cwd: REPO, encoding: 'utf8' }).trim();
}

// Mirror the app's `isNewer` (appUpdaterHelpers.ts): 3-part numeric compare,
// leading non-digits stripped, missing parts treated as 0.
function isNewer(a, b) {
  const pa = String(a).replace(/^[^0-9]*/, '').split('.').map(Number);
  const pb = String(b).replace(/^[^0-9]*/, '').split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] ?? 0) > (pb[i] ?? 0)) return true;
    if ((pa[i] ?? 0) < (pb[i] ?? 0)) return false;
  }
  return false;
}

// Canonical (recursively key-sorted) JSON so a field reorder does not read as a
// change.
function canon(v) {
  if (Array.isArray(v)) return `[${v.map(canon).join(',')}]`;
  if (v && typeof v === 'object') {
    return `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${canon(v[k])}`).join(',')}}`;
  }
  return JSON.stringify(v);
}

// True when two manifests are identical except for the `changelog` field — the
// edit only documents release notes and ships no functional change.
function sameIgnoringChangelog(a, b) {
  const strip = ({ changelog, ...rest }) => rest;
  return canon(strip(a)) === canon(strip(b));
}

const baseRef = `origin/${base}`;
try {
  sh(`git fetch --quiet origin ${base}`);
  sh(`git rev-parse ${baseRef}`);
} catch {
  console.log(`check-version-bump: cannot resolve base ref "${base}" — skipping`);
  process.exit(0);
}

const changed = sh(`git diff --name-only ${baseRef}...HEAD -- themes/`)
  .split('\n')
  .filter(Boolean);

const ids = [
  ...new Set(
    changed
      .map(p => p.match(/^themes\/([^/]+)\//))
      .filter(Boolean)
      .map(m => m[1]),
  ),
];

const errors = [];
for (const id of ids) {
  const manifestPath = join(REPO, 'themes', id, 'manifest.json');
  if (!existsSync(manifestPath)) continue; // theme deleted in this PR

  let baseManifest;
  try {
    baseManifest = JSON.parse(sh(`git show ${baseRef}:themes/${id}/manifest.json`));
  } catch {
    continue; // not on base = brand-new theme, no bump required
  }

  let headManifest;
  try {
    headManifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch {
    continue; // malformed manifest — validate-theme.mjs reports that
  }

  if (isNewer(headManifest.version, baseManifest.version)) continue; // version bumped — fine

  // Version not bumped. Allow it only when the sole change to this theme is the
  // `changelog` field (documenting already-shipped versions). A theme.css edit
  // or any other manifest change still requires a bump.
  const themeFiles = changed.filter(p => p.startsWith(`themes/${id}/`));
  const changelogOnly =
    themeFiles.length === 1 &&
    themeFiles[0] === `themes/${id}/manifest.json` &&
    sameIgnoringChangelog(baseManifest, headManifest);
  if (changelogOnly) continue;

  errors.push(
    `${id}: files changed but manifest version is still "${headManifest.version}" ` +
      `(base "${baseManifest.version}"). Bump "version" in themes/${id}/manifest.json ` +
      `so the in-app theme store detects the update.`,
  );
}

if (errors.length) {
  console.error('Theme version bump required:\n' + errors.map(e => '  - ' + e).join('\n'));
  process.exit(1);
}
console.log(`check-version-bump: OK (${ids.length} changed theme folder(s) checked)`);
