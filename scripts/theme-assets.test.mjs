// Unit tests for the shared theme-asset contract. Run: `node --test scripts/`.
// Zero-dependency (node:test + node:assert), because these rules are the
// security boundary — path containment and the SVG content check — and the app
// mirrors them, so they must be pinned.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  isAllowedAssetPath,
  classifyUrlTarget,
  parseAssetRefs,
  svgContentProblems,
  auditThemeAssets,
} from './theme-assets.mjs';

test('isAllowedAssetPath accepts in-tree asset paths', () => {
  assert.equal(isAllowedAssetPath('assets/logo.svg'), true);
  assert.equal(isAllowedAssetPath('assets/fonts/display.woff2'), true);
  assert.equal(isAllowedAssetPath('assets/bg.webp'), true);
});

test('isAllowedAssetPath rejects traversal, absolute, remote and bad types', () => {
  assert.equal(isAllowedAssetPath('assets/../secret'), false); // traversal
  assert.equal(isAllowedAssetPath('/etc/passwd'), false); // absolute
  assert.equal(isAllowedAssetPath('assets\\logo.svg'), false); // backslash
  assert.equal(isAllowedAssetPath('logo.svg'), false); // not under assets/
  assert.equal(isAllowedAssetPath('assets/logo.exe'), false); // disallowed ext
  assert.equal(isAllowedAssetPath('assets/'), false); // no file
  assert.equal(isAllowedAssetPath(''), false);
});

test('classifyUrlTarget separates data, asset and reject', () => {
  assert.equal(classifyUrlTarget('data:image/png;base64,AAAA'), 'data');
  assert.equal(classifyUrlTarget('assets/logo.svg'), 'asset');
  assert.equal(classifyUrlTarget("'assets/logo.svg'"), 'asset'); // quoted
  assert.equal(classifyUrlTarget('https://evil.example/x.png'), 'reject');
  assert.equal(classifyUrlTarget('//evil.example/x.png'), 'reject');
  assert.equal(classifyUrlTarget('../x.png'), 'reject');
});

test('parseAssetRefs extracts and dedupes only asset paths', () => {
  const css = `
    .a { background: url("assets/one.webp"); }
    .b { background: url(assets/one.webp); }
    .c { background: url('assets/two.svg'); }
    .d { background: url(data:image/gif;base64,AA); }
    .e { background: url(https://x.example/three.png); }
  `;
  assert.deepEqual(parseAssetRefs(css), ['assets/one.webp', 'assets/two.svg']);
});

test('svgContentProblems flags active or exfiltrating SVGs', () => {
  assert.ok(svgContentProblems('<svg><script>alert(1)</script></svg>').length > 0);
  assert.ok(svgContentProblems('<svg onload="x()"></svg>').length > 0);
  assert.ok(svgContentProblems('<svg><foreignObject></foreignObject></svg>').length > 0);
  assert.ok(svgContentProblems('<svg><a href="javascript:x"></a></svg>').length > 0);
  assert.ok(svgContentProblems('<image href="https://x.example/a.png"/>').length > 0);
});

test('svgContentProblems passes a clean decorative SVG', () => {
  const clean = '<svg xmlns="http://www.w3.org/2000/svg"><use href="#g"/><path d="M0 0h10v10H0z"/></svg>';
  assert.deepEqual(svgContentProblems(clean), []);
});

// --- auditThemeAssets against a real folder ---

function fixture(build) {
  const dir = mkdtempSync(join(tmpdir(), 'psy-theme-'));
  mkdirSync(join(dir, 'assets'), { recursive: true });
  build(dir);
  return dir;
}

test('auditThemeAssets is clean for a referenced, in-budget asset', () => {
  const dir = fixture((d) => writeFileSync(join(d, 'assets', 'logo.svg'), '<svg><path d="M0 0"/></svg>'));
  try {
    const { errors, warnings } = auditThemeAssets(dir, '.a{background:url("assets/logo.svg")}');
    assert.deepEqual(errors, []);
    assert.deepEqual(warnings, []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('auditThemeAssets errors on a missing referenced file', () => {
  const dir = fixture(() => {});
  try {
    const { errors } = auditThemeAssets(dir, '.a{background:url("assets/nope.webp")}');
    assert.ok(errors.some((e) => e.includes('nope.webp')));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('auditThemeAssets errors on a disallowed extension and a bad SVG', () => {
  const dir = fixture((d) => {
    writeFileSync(join(d, 'assets', 'evil.exe'), 'MZ');
    writeFileSync(join(d, 'assets', 'x.svg'), '<svg onload="x()"/>');
  });
  try {
    const { errors } = auditThemeAssets(dir, '.a{background:url("assets/x.svg")}');
    assert.ok(errors.some((e) => e.includes('evil.exe')));
    assert.ok(errors.some((e) => e.includes('x.svg') && e.includes('event handler')));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('auditThemeAssets warns on an unreferenced file', () => {
  const dir = fixture((d) => writeFileSync(join(d, 'assets', 'orphan.webp'), 'x'));
  try {
    const { errors, warnings } = auditThemeAssets(dir, '.a{color:red}');
    assert.deepEqual(errors, []);
    assert.ok(warnings.some((w) => w.includes('orphan.webp')));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('auditThemeAssets is a no-op for a theme with no assets/ dir', () => {
  const dir = mkdtempSync(join(tmpdir(), 'psy-theme-'));
  try {
    const { errors, warnings, files } = auditThemeAssets(dir, '.a{color:red}');
    assert.deepEqual(errors, []);
    assert.deepEqual(warnings, []);
    assert.deepEqual(files, []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
