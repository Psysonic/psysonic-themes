#!/usr/bin/env node
// Validate one community theme folder against the Psysonic theme-store safety floor.
//
//   node scripts/validate-theme.mjs themes/<id>
//   node scripts/validate-theme.mjs            # validates every folder in themes/
//
// Community themes are free-form (any selectors, structure, @keyframes,
// animations). This validator is an *assistant*: it enforces only the hard
// safety floor, a well-formed manifest, and a valid thumbnail. Quality, taste
// and performance are handled by manual moderation; sideloaded themes are the
// user's own risk. The floor mirrors the in-app guard
// (psysonic/src/utils/themes/themeInjection.ts):
//   - a theme folder must contain manifest.json, theme.css, thumbnail.png
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

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');

const manifestSchema = JSON.parse(readFileSync(join(REPO, 'schema', 'manifest.schema.json'), 'utf8'));

// Thumbnail constraints.
const THUMB_MAX_BYTES = 300 * 1024;
const THUMB = { minW: 320, maxW: 960, minH: 200, maxH: 600, minAspect: 1.4, maxAspect: 1.7 };
const CSS_MAX_BYTES = 256 * 1024;

const ajv = new Ajv({ allErrors: true });
const validateManifest = ajv.compile(manifestSchema);

/** Collect problems for one theme folder; return an array of message strings. */
function validateTheme(folder) {
  const errors = [];
  const id = basename(folder);
  const push = (m) => errors.push(m);

  // ---- files present ----
  const manifestPath = join(folder, 'manifest.json');
  const cssPath = join(folder, 'theme.css');
  const thumbPath = join(folder, 'thumbnail.png');
  for (const [label, p] of [['manifest.json', manifestPath], ['theme.css', cssPath], ['thumbnail.png', thumbPath]]) {
    if (!existsSync(p)) push(`missing ${label}`);
  }
  if (errors.length) return errors; // nothing else is meaningful without the files

  // ---- manifest ----
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch (e) {
    push(`manifest.json is not valid JSON: ${e.message}`);
    return errors;
  }
  if (!validateManifest(manifest)) {
    for (const e of validateManifest.errors) {
      push(`manifest${e.instancePath || ''} ${e.message}`);
    }
  }
  if (manifest.id !== undefined && manifest.id !== id) {
    push(`manifest.id "${manifest.id}" must equal the folder name "${id}"`);
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
    return errors;
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
      if (!/^data:/i.test(inner)) push(`${decl.prop}: only url(data:...) is allowed (got: ${u})`);
    }
  });

  // ---- thumbnail ----
  validateThumbnail(thumbPath, push);

  return errors;
}

/** PNG sanity: magic bytes, size cap, dimensions from the IHDR chunk. */
function validateThumbnail(path, push) {
  const buf = readFileSync(path);
  const size = statSync(path).size;
  if (size > THUMB_MAX_BYTES) push(`thumbnail.png is ${(size / 1024).toFixed(0)} KB; cap is ${THUMB_MAX_BYTES / 1024} KB`);
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (buf.length < 24 || !sig.every((b, i) => buf[i] === b)) {
    push('thumbnail.png is not a valid PNG');
    return;
  }
  // IHDR is the first chunk: length(4) "IHDR"(4) width(4) height(4) ...
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  const aspect = width / height;
  if (width < THUMB.minW || width > THUMB.maxW) push(`thumbnail width ${width}px outside ${THUMB.minW}-${THUMB.maxW}px`);
  if (height < THUMB.minH || height > THUMB.maxH) push(`thumbnail height ${height}px outside ${THUMB.minH}-${THUMB.maxH}px`);
  if (aspect < THUMB.minAspect || aspect > THUMB.maxAspect) {
    push(`thumbnail aspect ${aspect.toFixed(2)} outside ${THUMB.minAspect}-${THUMB.maxAspect} (recommended 720x450)`);
  }
}

// ---- entry point ----
function main() {
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
    const errors = validateTheme(folder);
    if (errors.length === 0) {
      console.log(`PASS  ${id}`);
    } else {
      failed++;
      console.log(`FAIL  ${id}`);
      for (const e of errors) console.log(`        - ${e}`);
    }
  }

  if (failed > 0) {
    console.log(`\n${failed} theme(s) failed validation.`);
    process.exit(1);
  }
  console.log(`\nAll ${folders.length} theme(s) valid.`);
}

main();
