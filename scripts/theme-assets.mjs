// Shared contract for a theme's local `assets/` directory.
//
// A theme may ship files in an `assets/` folder next to manifest.json / theme.css
// and reference them from CSS with a relative `url("assets/…")`. This module is
// the single definition of what is allowed, imported by both the validator and
// the registry builder so the two can never drift. The in-app install path
// (psysonic/src/lib/themes) mirrors these exact rules — keep them in step.
//
// The point of local assets is to stay fully local: no network. So a reference
// is either a `data:` URI (as before) or a path under `assets/`, and nothing
// else. Everything the floor already forbade — @import, remote url(), scripts —
// stays forbidden.

import { readdirSync, statSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/** Extensions an asset file may use. Images plus web fonts — nothing executable. */
export const ASSET_EXTS = ['webp', 'png', 'jpg', 'jpeg', 'gif', 'avif', 'svg', 'woff2', 'woff'];

/** Budgets. Deliberately small: a woff2 subset is ~30–80 KB, a full-bleed WebP
 *  ~100–300 KB. Enough for an image-led theme without bloating the store. */
export const ASSET_CAPS = {
  perFileBytes: 1 * 1024 * 1024, // 1 MB
  perThemeBytes: 4 * 1024 * 1024, // 4 MB (hard)
  warnThemeBytes: 1.5 * 1024 * 1024, // 1.5 MB (soft — nudge toward WebP)
  maxFiles: 32,
};

const EXT_RE = new RegExp(`\\.(${ASSET_EXTS.join('|')})$`, 'i');

/** True when a relative path is a safe, in-tree `assets/…` reference. */
export function isAllowedAssetPath(p) {
  if (typeof p !== 'string' || p.length === 0) return false;
  if (p.includes('\\')) return false; // backslash — never a web path
  if (p.startsWith('/')) return false; // absolute
  if (p.startsWith('assets/') === false) return false; // must live under assets/
  const segments = p.split('/');
  if (segments.some((s) => s === '..' || s === '')) return false; // no traversal / empty segment
  return EXT_RE.test(p);
}

/** Classify a raw url() target: 'data' | 'asset' | 'reject'. Shared with the
 *  in-app floor so CI and the app agree on every case. */
export function classifyUrlTarget(inner) {
  // Strip surrounding quotes and whitespace: callers may pass either the raw
  // `url()` body (no closing quote) or a fully quoted target.
  const s = inner.trim().replace(/^['"]/, '').replace(/['"]$/, '').trim();
  if (/^data:/i.test(s)) return 'data';
  if (isAllowedAssetPath(s)) return 'asset';
  return 'reject';
}

/** Every `assets/…` path referenced by the CSS text (deduped, in first-seen order). */
export function parseAssetRefs(css) {
  const refs = [];
  const seen = new Set();
  const urlRe = /url\(\s*(['"]?)([^'")]*)\1\s*\)/gi;
  let m;
  while ((m = urlRe.exec(css)) !== null) {
    const target = m[2].trim();
    if (isAllowedAssetPath(target) && !seen.has(target)) {
      seen.add(target);
      refs.push(target);
    }
  }
  return refs;
}

/** Recursively list files under `<folder>/assets`, as `{ rel, bytes }` where
 *  `rel` is forward-slashed and relative to the theme folder (e.g. `assets/x.svg`).
 *  Returns [] when there is no assets/ directory. */
export function listAssetFiles(folder) {
  const root = join(folder, 'assets');
  let top;
  try {
    top = statSync(root);
  } catch {
    return [];
  }
  if (!top.isDirectory()) return [];
  const out = [];
  const walk = (dir) => {
    for (const ent of readdirSync(dir, { withFileTypes: true })) {
      const abs = join(dir, ent.name);
      if (ent.isDirectory()) walk(abs);
      else if (ent.isFile()) {
        out.push({ rel: relative(folder, abs).split(sep).join('/'), bytes: statSync(abs).size });
      }
    }
  };
  walk(root);
  out.sort((a, b) => a.rel.localeCompare(b.rel));
  return out;
}

/** Load an SVG's text for the content check. */
function readText(folder, rel) {
  return readFileSync(join(folder, rel), 'utf8');
}

/**
 * Inspect an SVG referenced only from CSS `url()`. Rendered that way a browser
 * does not run scripts, but we defend in depth so a sideloaded theme (no
 * moderation) still can't ship an active or exfiltrating SVG. Returns a list of
 * problem strings (empty = clean).
 */
export function svgContentProblems(text) {
  const problems = [];
  if (/<\s*script\b/i.test(text)) problems.push('contains <script>');
  if (/\son\w+\s*=/i.test(text)) problems.push('contains an inline event handler (on…=)');
  if (/<\s*foreignObject\b/i.test(text)) problems.push('contains <foreignObject>');
  if (/javascript:/i.test(text)) problems.push('contains a javascript: URI');
  // External references (href / xlink:href / src) that are neither an in-file
  // fragment (#id) nor a data: URI would pull off the network.
  const refRe = /(?:xlink:href|href|src)\s*=\s*(['"])([^'"]*)\1/gi;
  let m;
  while ((m = refRe.exec(text)) !== null) {
    const v = m[2].trim();
    if (v && !v.startsWith('#') && !/^data:/i.test(v)) {
      problems.push(`references an external resource (${v.slice(0, 40)})`);
    }
  }
  return problems;
}

/**
 * Full asset audit for one theme folder given its CSS text. Returns
 * `{ errors, warnings, files }`. Pure w.r.t. the app — the same checks run in the
 * install path. Callers decide how to surface the two lists.
 */
export function auditThemeAssets(folder, css) {
  const errors = [];
  const warnings = [];
  const files = listAssetFiles(folder);
  const byRel = new Map(files.map((f) => [f.rel, f]));

  // 1. Every referenced asset must exist on disk.
  const refs = parseAssetRefs(css);
  for (const ref of refs) {
    if (!byRel.has(ref)) errors.push(`css references "${ref}" but no such file exists under assets/`);
  }

  // 2. Every file present must have an allowed extension and pass its checks.
  let total = 0;
  for (const f of files) {
    total += f.bytes;
    if (!EXT_RE.test(f.rel)) {
      errors.push(`asset "${f.rel}" has a disallowed type (allowed: ${ASSET_EXTS.join(', ')})`);
      continue;
    }
    if (f.bytes > ASSET_CAPS.perFileBytes) {
      errors.push(`asset "${f.rel}" is ${(f.bytes / 1024).toFixed(0)} KB; per-file cap is ${ASSET_CAPS.perFileBytes / 1024} KB`);
    }
    if (/\.svg$/i.test(f.rel)) {
      for (const p of svgContentProblems(readText(folder, f.rel))) {
        errors.push(`asset "${f.rel}" ${p}`);
      }
    }
  }

  // 3. Count and total-size budgets.
  if (files.length > ASSET_CAPS.maxFiles) {
    errors.push(`${files.length} asset files; the cap is ${ASSET_CAPS.maxFiles}`);
  }
  if (total > ASSET_CAPS.perThemeBytes) {
    errors.push(`assets total ${(total / 1024 / 1024).toFixed(1)} MB; the per-theme cap is ${ASSET_CAPS.perThemeBytes / 1024 / 1024} MB`);
  } else if (total > ASSET_CAPS.warnThemeBytes) {
    warnings.push(`assets total ${(total / 1024 / 1024).toFixed(1)} MB; consider WebP to stay under ${ASSET_CAPS.warnThemeBytes / 1024 / 1024} MB`);
  }

  // 4. Dead weight: a file shipped but never referenced by the CSS.
  const referenced = new Set(refs);
  for (const f of files) {
    if (!referenced.has(f.rel)) warnings.push(`asset "${f.rel}" is not referenced by theme.css`);
  }

  return { errors, warnings, files };
}
