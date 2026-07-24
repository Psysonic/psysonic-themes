#!/usr/bin/env node
// Regenerate registry.json from every theme manifest under themes/.
//
//   node scripts/build-registry.mjs
//
// registry.json is the single file the app reads (over GitHub raw). It is
// AUTO-GENERATED — never hand-edit it. CSS and thumbnails are referenced by
// relative path and fetched on demand; the client prepends the asset base.
//
// updatedAt (ISO date of the last commit touching a theme) is derived here from
// git, so the build needs full history (actions/checkout fetch-depth: 0).

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { listAssetFiles } from './theme-assets.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const themesDir = join(REPO, 'themes');

const SCHEMA_VERSION = 1;

const registryPath = join(REPO, 'registry.json');

/** ISO date of the last commit touching themes/<id>/, or undefined. */
function lastModified(id) {
  try {
    return execSync(`git log -1 --format=%cI -- themes/${id}`, { cwd: REPO, encoding: 'utf8' }).trim() || undefined;
  } catch {
    return undefined;
  }
}

function build() {
  const themes = [];
  if (existsSync(themesDir)) {
    const ids = readdirSync(themesDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort();
    for (const id of ids) {
      const manifestPath = join(themesDir, id, 'manifest.json');
      if (!existsSync(manifestPath)) continue;
      const m = JSON.parse(readFileSync(manifestPath, 'utf8'));
      // A theme animates if its CSS defines @keyframes — the app flags these on
      // setups where animation is costly (Nvidia/Linux, compositing off).
      const cssPath = join(themesDir, id, 'theme.css');
      const animated = existsSync(cssPath) && /@(?:-[a-z]+-)?keyframes\b/i.test(readFileSync(cssPath, 'utf8'));
      // Local assets shipped alongside the theme. The install path reads this
      // list to fetch and write each file; empty for the vast majority of themes.
      const assets = listAssetFiles(join(themesDir, id)).map((a) => ({
        path: `themes/${id}/${a.rel}`,
        bytes: a.bytes,
      }));
      themes.push({
        id: m.id,
        name: m.name,
        author: m.author,
        version: m.version,
        description: m.description,
        mode: m.mode,
        ...(m.tags ? { tags: m.tags } : {}),
        ...(m.minAppVersion ? { minAppVersion: m.minAppVersion } : {}),
        ...(m.changelog ? { changelog: m.changelog } : {}),
        ...(animated ? { animated: true } : {}),
        ...(assets.length ? { assets } : {}),
        css: `themes/${id}/theme.css`,
        thumbnail: `themes/${id}/thumbnail.webp`,
        ...(lastModified(id) ? { updatedAt: lastModified(id) } : {}),
      });
    }
  }

  const registry = {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    themes,
  };
  writeFileSync(registryPath, JSON.stringify(registry, null, 2) + '\n');
  console.log(`registry.json: ${themes.length} theme(s)`);
}

build();
