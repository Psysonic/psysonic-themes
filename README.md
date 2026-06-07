<p align="left">
  <img src="img/themeslogo.png" alt="Psysonic Themes" width="460">
</p>

The community theme catalogue for **[Psysonic](https://github.com/Psychotoxical/psysonic)**, the cross-platform music player.

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
thumbnail on demand. Nothing here is bundled into the app.

## Anatomy of a theme

```
themes/<id>/
├── manifest.json   # id, name, author, version, description, mode, [tags], [minAppVersion]
├── theme.css       # your theme's CSS (recolour the semantic tokens, and more)
└── thumbnail.png   # store preview (recommended 720×450)
```

`theme.css` is free-form CSS. The recommended starting point is to recolour the
semantic tokens in [`schema/allowed-tokens.json`](schema/allowed-tokens.json) on
the `[data-theme='<id>']` root — that recolours the whole app in one place — but
you may also add any selectors, structure, `@media`, and `@keyframes`. Themes can
react to app state via same-element attributes on the root, e.g.
`[data-theme='<id>'][data-playing='true']` (also `data-fullscreen`,
`data-sidebar-collapsed`, `data-lyrics-open`).

The validator (`scripts/validate-theme.mjs`) enforces the **safety floor**, not
your design: no `@import` and `url()` only as `data:` (themes never touch the
network), no scripts (`expression()`, `javascript:`), no `<style>` breakout, and
`@keyframes` names must start with `<id>-` so animations don't collide between
themes. Quality and taste are handled by review.

## Make a theme

1. Copy [`template/`](template/) to `themes/<your-id>/`.
2. Rename the `[data-theme='template']` selector and `manifest.id` to your id
   (lowercase kebab-case, must match the folder name).
3. Recolour the tokens (the simplest path), and/or add your own selectors and
   animations. Unused optional tokens can be trimmed.
4. Add a `thumbnail.png`: a screenshot of Psysonic with your theme applied (PNG,
   ≤ 300 KB, recommended 720×450). Quick placeholder:
   `node scripts/make-thumbnail.mjs themes/<your-id>/thumbnail.png "#15171e"`.
5. Validate, then open a pull request.

```
npm install
node scripts/validate-theme.mjs themes/<your-id>   # one theme
node scripts/validate-theme.mjs                    # every theme
```

See **[CONTRIBUTING.md](CONTRIBUTING.md)** for the full guide — naming,
description conventions, and the PR checklist.

## Registry

[`registry.json`](registry.json) is the single index the app reads. It is
**auto-generated** from the theme manifests — never edit it by hand. A workflow
regenerates it on every push to `main`; locally, run `npm run registry`.

## License

Themes are contributed and distributed under the [MIT License](LICENSE).
