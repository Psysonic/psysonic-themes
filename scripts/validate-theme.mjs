#!/usr/bin/env node
// Validate one community theme folder against the Psysonic theme-store safety floor.
//
//   node scripts/validate-theme.mjs themes/<id>
//   node scripts/validate-theme.mjs            # validates every folder in themes/
//
// Community themes are free-form (any selectors, structure, @keyframes,
// animations). This validator is an *assistant*: it enforces only the hard
// safety floor, a well-formed manifest, and a usable thumbnail. Quality, taste
// and performance are handled by manual moderation; sideloaded themes are the
// user's own risk. The floor mirrors the in-app guard
// (psysonic/src/utils/themes/themeInjection.ts):
//   - a theme folder must contain manifest.json, theme.css, and a thumbnail
//     (thumbnail.png / .jpg / .webp — CI normalises it to thumbnail.webp)
//   - no network: no @import, and url() only as a data: URI
//   - no global custom-property registration (@property)
//   - no script-in-CSS (expression(), javascript:, -moz-binding) or <style>/<script>
//   - @keyframes must be namespaced as <id>-…
//   - a size cap
// Exits non-zero on the first failing theme; prints every problem it found.

import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { dirname, join, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import postcss from 'postcss';
import Ajv from 'ajv';
import sharp from 'sharp';
import { auditThemeAssets, classifyUrlTarget } from './theme-assets.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');

const manifestSchema = JSON.parse(readFileSync(join(REPO, 'schema', 'manifest.schema.json'), 'utf8'));

// Thumbnail constraints. Sources may be PNG/JPG/WebP; CI normalises them to a
// ≤1280×720 16:9 WebP. Require enough source resolution to reach full size, a
// 16:9-ish aspect (a standard screenshot), and a reasonable file cap.
const THUMB_EXTS = ['png', 'jpg', 'jpeg', 'webp'];
const THUMB_MAX_BYTES = 6 * 1024 * 1024; // source cap (the emitted WebP is tiny)
const THUMB = { minW: 1280, minH: 720, minAspect: 1.5, maxAspect: 1.85 };
const CSS_MAX_BYTES = 256 * 1024;

const ajv = new Ajv({ allErrors: true });
const validateManifest = ajv.compile(manifestSchema);

/** Collect problems for one theme folder; resolves to an array of messages. */
async function validateTheme(folder) {
  const errors = [];
  const id = basename(folder);
  const push = (m) => errors.push(m);

  // ---- files present ----
  const manifestPath = join(folder, 'manifest.json');
  const cssPath = join(folder, 'theme.css');
  if (!existsSync(manifestPath)) push('missing manifest.json');
  if (!existsSync(cssPath)) push('missing theme.css');
  const thumbPath = THUMB_EXTS.map((e) => join(folder, `thumbnail.${e}`)).find((p) => existsSync(p)) || null;
  if (!thumbPath) push('missing thumbnail (thumbnail.png / .jpg / .webp)');
  if (errors.length) return { errors, warnings: [] }; // nothing else is meaningful without the files

  // ---- manifest ----
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch (e) {
    push(`manifest.json is not valid JSON: ${e.message}`);
    return { errors, warnings: [] };
  }
  if (!validateManifest(manifest)) {
    for (const e of validateManifest.errors) {
      push(`manifest${e.instancePath || ''} ${e.message}`);
    }
  }
  if (manifest.id !== undefined && manifest.id !== id) {
    push(`manifest.id "${manifest.id}" must equal the folder name "${id}"`);
  }

  // Changelog keys must be plain X.Y.Z versions — the store sorts them
  // numerically. The schema validates only the value shape, so report a precise
  // message here instead of ajv's generic "additional properties" error.
  if (manifest.changelog && typeof manifest.changelog === 'object' && !Array.isArray(manifest.changelog)) {
    const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
    for (const key of Object.keys(manifest.changelog)) {
      if (!SEMVER.test(key)) {
        push(`changelog key "${key}" must be a plain X.Y.Z version (no pre-release or build suffix)`);
      }
    }
  }

  // ---- css safety floor ----
  const css = readFileSync(cssPath, 'utf8');
  if (Buffer.byteLength(css, 'utf8') > CSS_MAX_BYTES) {
    push(`theme.css is larger than ${CSS_MAX_BYTES / 1024} KB`);
  }
  if (/<\/?\s*(?:style|script)\b/i.test(css)) {
    push('theme.css must not contain <style> or <script>');
  }

  let root;
  try {
    root = postcss.parse(css, { from: cssPath });
  } catch (e) {
    push(`theme.css does not parse: ${e.message}`);
    return { errors, warnings: [] };
  }

  root.walkAtRules((at) => {
    const name = at.name.toLowerCase();
    if (name === 'import') {
      push('@import is not allowed (themes may not reach the network)');
    } else if (name.endsWith('property')) {
      push('@property is not allowed (it registers a global custom property)');
    } else if (name.endsWith('keyframes')) {
      const kf = at.params.trim();
      if (!kf.startsWith(`${id}-`)) {
        push(`@keyframes "${kf}" must be namespaced as "${id}-…" to avoid collisions between themes`);
      }
    }
  });

  root.walkDecls((decl) => {
    const value = decl.value.toLowerCase();
    if (/expression\s*\(/.test(value) || value.includes('javascript:') || value.includes('-moz-binding')) {
      push(`${decl.prop}: forbidden value (script-in-CSS)`);
    }
    const urls = value.match(/url\(\s*['"]?\s*[^'")]*/g) || [];
    for (const u of urls) {
      const inner = u.replace(/^url\(\s*['"]?\s*/i, '');
      // A url() target may be an inline data: URI or a local `assets/…` path;
      // anything else would reach the network.
      if (classifyUrlTarget(inner) === 'reject') {
        push(`${decl.prop}: only url(data:...) or url(assets/...) is allowed (got: ${u})`);
      }
    }
  });

  // ---- local assets ----
  // Existence of every referenced file, extension whitelist, per-file/per-theme
  // budgets, file count, and an SVG content check. Warnings (oversized total,
  // unreferenced files) do not fail the build.
  const assetAudit = auditThemeAssets(folder, css);
  for (const e of assetAudit.errors) push(e);
  // A theme that ships assets needs an app build that supports them; without a
  // declared floor it would silently fail to install on every released client.
  // The concrete version is the release where asset support lands — set it in
  // manifest.minAppVersion.
  if (assetAudit.files.length > 0 && !manifest.minAppVersion) {
    push('theme ships assets/ but manifest.minAppVersion is not set — declare the app version that supports local assets');
  }

  // ---- thumbnail ----
  await validateThumbnail(thumbPath, push);

  return { errors, warnings: assetAudit.warnings };
}

/** Thumbnail sanity via sharp: decodable image, format, dimensions, file cap. */
async function validateThumbnail(path, push) {
  const size = statSync(path).size;
  if (size > THUMB_MAX_BYTES) push(`thumbnail is ${(size / 1024 / 1024).toFixed(1)} MB; cap is ${THUMB_MAX_BYTES / 1024 / 1024} MB`);
  let meta;
  try {
    meta = await sharp(path).metadata();
  } catch {
    push('thumbnail is not a readable image');
    return;
  }
  if (!THUMB_EXTS.includes((meta.format || '').replace('jpeg', 'jpeg'))) {
    push(`thumbnail must be PNG, JPG or WebP (got: ${meta.format})`);
  }
  const w = meta.width || 0;
  const h = meta.height || 0;
  if (w < THUMB.minW || h < THUMB.minH) {
    push(`thumbnail is ${w}x${h}; the source must be at least ${THUMB.minW}x${THUMB.minH} (a 16:9 screenshot)`);
  }
  const aspect = h ? w / h : 0;
  if (aspect < THUMB.minAspect || aspect > THUMB.maxAspect) {
    push(`thumbnail aspect ${aspect.toFixed(2)} outside ${THUMB.minAspect}-${THUMB.maxAspect}; use a 16:9 screenshot`);
  }
}

// ---- entry point ----
async function main() {
  const arg = process.argv[2];
  let folders;
  if (arg) {
    folders = [resolve(arg)];
  } else {
    const themesDir = join(REPO, 'themes');
    folders = existsSync(themesDir)
      ? readdirSync(themesDir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => join(themesDir, d.name))
      : [];
  }

  if (folders.length === 0) {
    console.log('No theme folders to validate.');
    return;
  }

  let failed = 0;
  for (const folder of folders) {
    const id = basename(folder);
    const { errors, warnings } = await validateTheme(folder);
    if (errors.length === 0) {
      console.log(`PASS  ${id}`);
    } else {
      failed++;
      console.log(`FAIL  ${id}`);
      for (const e of errors) console.log(`        - ${e}`);
    }
    // Warnings never fail the build — they nudge (oversized asset total, a
    // shipped file the CSS never references).
    for (const w of warnings) console.log(`        ! ${id}: ${w}`);
  }

  if (failed > 0) {
    console.log(`\n${failed} theme(s) failed validation.`);
    process.exit(1);
  }
  console.log(`\nAll ${folders.length} theme(s) valid.`);
}

main();
