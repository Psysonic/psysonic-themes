<p align="left">
  <img src="img/themeslogo.png" alt="Psysonic Themes" width="460">
</p>

The community theme catalogue for **[Psysonic](https://github.com/Psychotoxical/psysonic)**, the cross-platform music player.

📖 **[Read the wiki](https://github.com/Psysonic/psysonic-themes/wiki)** for the full guide — theme anatomy, the complete token reference, the validator's safety floor, local assets, versioning, an FAQ, and a browsable gallery of every theme in the store.

Psysonic ships with six core themes built in; every other palette lives here and
installs **on demand** from the in-app **Theme Store** — 80-plus and counting.
They range from faithful recolours of beloved open-source palettes (Catppuccin,
Gruvbox, Nord, Dracula, Kanagawa, Nightfox, Atom One, …) to themes inspired by
apps, films, games, and classic operating systems.

A theme is plain CSS that follows a small **safety floor** — no scripts, nothing
loaded off the network. The simplest theme just recolours a set of semantic
tokens, but themes are free-form: any selectors, structure, and animations are
fair game. Store submissions are reviewed by maintainers before they're merged;
you can also import your own `.zip` straight into the app, at your own risk.

## Using themes

In Psysonic, open **Settings → Themes → Theme Store**, then search, preview, and
hit **Install**. Installed themes apply instantly and keep working offline. You
don't need to clone this repo — it's just the source the app reads from.


## How it works

The app reads one auto-generated index, [`registry.json`](registry.json), over
the [jsDelivr](https://www.jsdelivr.com/) CDN, and pulls each theme's CSS and
thumbnail on demand. Nothing here is bundled into the app. See the wiki's
**[Registry & Versioning](https://github.com/Psysonic/psysonic-themes/wiki/Registry-%26-Versioning)**
page for how the registry is generated and how version bumps propagate to users.

## Anatomy of a theme

```
themes/<id>/
├── manifest.json   # id, name, author, version, description, mode, [tags], [minAppVersion], [changelog]
├── theme.css       # your theme's CSS (recolour the semantic tokens, and more)
├── thumbnail.png   # store preview screenshot — PNG/JPG, 16:9 (CI converts to WebP)
└── assets/         # optional — local images and fonts, referenced by relative url() (see below)
```

`theme.css` is free-form CSS. The recommended starting point is to recolour the
semantic tokens in [`schema/allowed-tokens.json`](schema/allowed-tokens.json) on
the `[data-theme='<id>']` root — that recolours the whole app in one place — but
you may also add any selectors, structure, `@media`, and `@keyframes`. Themes can
react to app state via same-element attributes on the root, e.g.
`[data-theme='<id>'][data-playing='true']` (also `data-fullscreen`,
`data-sidebar-collapsed`, `data-lyrics-open`).

The full field-by-field breakdown of `manifest.json` and every token in
`allowed-tokens.json` lives on the wiki:
**[Theme Anatomy](https://github.com/Psysonic/psysonic-themes/wiki/Theme-Anatomy)** ·
**[Design Tokens](https://github.com/Psysonic/psysonic-themes/wiki/Design-Tokens)**.

The validator (`scripts/validate-theme.mjs`) enforces the **safety floor**, not
your design: no `@import` and `url()` only as `data:` (themes never touch the
network), no scripts (`expression()`, `javascript:`), no `<style>` breakout, and
`@keyframes` names must start with `<id>-` so animations don't collide between
themes. Quality and taste are handled by review. Full details:
**[Validator & CI](https://github.com/Psysonic/psysonic-themes/wiki/Validator-%26-CI)**.

**Restyle appearance, not behaviour.** Free-form means you *can* override any
property, but a few carry behaviour rather than looks, and overriding them breaks
the feature — usually somewhere you won't connect to the change. The known trap:
the horizontal album rails scroll *because* `.album-grid` has `overflow-x: auto`,
and that scroll container is what the rails' `‹` / `›` arrows drive. Setting
`overflow: visible` on it — the intuitive fix when a card's shadow looks clipped —
kills both arrows. Use the `--rail-shadow-room` token (see
[`allowed-tokens.json`](schema/allowed-tokens.json) → `layout`) to give the shadow
room instead, and leave `overflow` alone. More recurring gotchas like this are
collected on the wiki's **[FAQ](https://github.com/Psysonic/psysonic-themes/wiki/FAQ)**.

### Changelog (optional)

Every version bump signals an update to installed clients, but users can't see
*what* changed — especially for non-visual fixes. Add an optional `changelog`
object to your manifest so the store can show an expandable **What's new** on
your theme's card. Keys are `X.Y.Z` versions, each a short list of change lines:

```json
"changelog": {
  "1.2.0": ["Fixed hover contrast on sidebar icons", "Fixed data-playing pulse lag"],
  "1.1.0": ["Softened the accent colour"]
}
```

When you bump `version`, add the matching entry. The store lists every version
you provide, newest first; themes without a changelog simply don't show the
section.

Keys must be plain `X.Y.Z` versions matching your released versions (no
pre-release or build suffixes). Each version lists 1–20 lines of up to 200
characters, and a manifest may carry up to 50 versions. See
**[Registry & Versioning](https://github.com/Psysonic/psysonic-themes/wiki/Registry-%26-Versioning)**
on the wiki for how this feeds the store's update detection.

### Local assets (optional)

Drop images and fonts in an `assets/` folder next to `theme.css` and reference
them with a **relative** `url()`:

```css
[data-theme='<id>'] .sidebar-brand::before {
  background-image: url("assets/wordmark.svg");
}
@font-face {
  font-family: 'MyDisplay';
  src: url("assets/display.woff2") format("woff2");
}
[data-theme='<id>'] { --font-display: 'MyDisplay', sans-serif; }
```

This is the alternative to cramming everything into a `data:` URI. It keeps
`theme.css` readable and lets a web font live outside the 256 KB CSS cap. Assets
stay **fully local** — the whole point of the safety floor is that a theme never
touches the network, so a `url()` may be either a `data:` URI or an `assets/…`
path, and nothing else.

**Rules (CI-enforced):**

- Files live under `assets/` (subfolders allowed). Reference them as
  `url("assets/…")` — no leading `/`, no `..`, no backslashes, no remote URL.
- Allowed types: `.webp .png .jpg .jpeg .gif .avif .svg .woff2 .woff`.
- Budgets: **1 MB per file, 4 MB per theme, 32 files.** A total above 1.5 MB is a
  (non-failing) warning — prefer WebP for images and a Latin-subset woff2 for
  fonts (typically 30–80 KB). The 256 KB CSS cap is separate and unchanged.
- Every file you ship should be referenced by the CSS; an unreferenced file is a
  warning (dead weight in the download).
- **SVG:** allowed, but it is checked for active/exfiltrating content — no
  `<script>`, inline `on…=` handlers, `<foreignObject>`, `javascript:` URIs, or
  external references. Referenced from CSS `url()` an SVG renders as an image and
  does not run scripts; the check is defence in depth, and it also runs on
  sideloaded themes where there is no review.

**App version:** local assets need an app build that supports them. Set
`"minAppVersion"` in your manifest to that version (announced when the feature
ships) — older clients then show *"requires a newer version"* on your card
instead of a failed install. Changing any file under `assets/` requires a
`version` bump, exactly like editing `theme.css`.

To iterate on assets without reinstalling, run the app against your checkout —
see **[Live preview](#make-a-theme)** above. Full rules:
**[Local Assets](https://github.com/Psysonic/psysonic-themes/wiki/Local-Assets)**
on the wiki.

Fonts: convert a TTF/OTF with `npx ttf2woff2 < Font.ttf > assets/display.woff2`
and apply it to `--font-display` (not `--font-sans`) so the user's font and
accessibility choices are preserved. Check the font's licence allows
redistribution before bundling it.

## Make a theme

1. Copy [`template/`](template/) to `themes/<your-id>/`.
2. Rename the `[data-theme='template']` selector and `manifest.id` to your id
   (lowercase kebab-case, must match the folder name).
3. Recolour the tokens (the simplest path), and/or add your own selectors and
   animations. Unused optional tokens can be trimmed.
4. Add a `thumbnail.png` (or `.jpg`): a **16:9 screenshot** of Psysonic with
   your theme applied (at least 1280×720). CI converts it to an optimized
   `thumbnail.webp` on merge, so you don't need to resize or convert anything —
   just drop in a screenshot. No screenshot yet? Quick placeholder:
   `node scripts/make-thumbnail.mjs themes/<your-id>/thumbnail.png "#15171e" 1280 720`.
5. Validate, then open a pull request.

```
npm install
node scripts/validate-theme.mjs themes/<your-id>   # one theme
node scripts/validate-theme.mjs                    # every theme
```

**Live preview (dev build):** if you run Psysonic from source, start it with
`--theme-watch <path>` and your work hot-reloads on every save — no zip, no
restart. The path can be a single `theme.css` (or a theme folder), or your
whole checkout of this repo: every `themes/*/theme.css` is watched, a startup
sweep makes each theme selectable in **Settings → Themes**, a save applies
live, and theme folders added while the app runs are picked up automatically.
(Dev builds only.)

```sh
npm run tauri:dev -- -- -- --theme-watch path/to/psysonic-themes
```

The three `--` are one separator per layer (npm → tauri CLI → cargo), all
needed for the flag to reach the app.

[Local assets](#local-assets-optional) hot-reload too: a watched theme's
`url("assets/…")` resolves against the folder its `theme.css` lives in, so you
can swap an image or a font in your checkout and see it on the next save,
without reinstalling. This needs the same app build as local assets themselves —
older dev builds load the theme but leave its asset urls unresolved, so the
images simply don't appear.

See **[CONTRIBUTING.md](CONTRIBUTING.md)** for the full guide — naming,
description conventions, and the PR checklist — or the wiki's
**[Making a Theme](https://github.com/Psysonic/psysonic-themes/wiki/Making-a-Theme)**
page for the same walkthrough with more context.

## Registry

[`registry.json`](registry.json) is the single index the app reads. It is
**auto-generated** from the theme manifests — never edit it by hand. A workflow
regenerates it on every push to `main`; locally, run `npm run registry`. See
**[Registry & Versioning](https://github.com/Psysonic/psysonic-themes/wiki/Registry-%26-Versioning)**
on the wiki for the full shape of `registry.json` and how versioning drives updates.

## Wiki

The **[wiki](https://github.com/Psysonic/psysonic-themes/wiki)** is the fuller
reference for everything above:

- **[Home](https://github.com/Psysonic/psysonic-themes/wiki/Home)** — overview and navigation
- **[Theme Anatomy](https://github.com/Psysonic/psysonic-themes/wiki/Theme-Anatomy)** — `manifest.json` field by field
- **[Design Tokens](https://github.com/Psysonic/psysonic-themes/wiki/Design-Tokens)** — every token, state selector, and layout token
- **[Making a Theme](https://github.com/Psysonic/psysonic-themes/wiki/Making-a-Theme)** — step-by-step build and submission guide
- **[Validator & CI](https://github.com/Psysonic/psysonic-themes/wiki/Validator-%26-CI)** — exactly what the safety floor checks
- **[Local Assets](https://github.com/Psysonic/psysonic-themes/wiki/Local-Assets)** — shipping images and fonts
- **[Registry & Versioning](https://github.com/Psysonic/psysonic-themes/wiki/Registry-%26-Versioning)** — how `registry.json` is generated and how updates propagate
- **[FAQ](https://github.com/Psysonic/psysonic-themes/wiki/FAQ)** — recurring gotchas and their fixes

## License

Themes are contributed and distributed under the [MIT License](LICENSE).
