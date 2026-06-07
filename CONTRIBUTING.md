# Contributing a theme

Thanks for adding to the Psysonic Theme Store! A theme is a small set of colour
tokens — validated automatically and served to the in-app store over a CDN.

## Quick start

1. Read the [README](README.md) — **Anatomy of a theme** and **Make a theme**.
2. Copy [`template/`](template/) to `themes/<your-id>/` (id = lowercase
   kebab-case, **must match the folder name**).
3. Recolour the tokens in `theme.css`, fill in `manifest.json`, add a
   `thumbnail.png` (or `.jpg`) — a **16:9 screenshot** of Psysonic.
4. Validate locally — it must print `PASS`:
   ```
   npm install
   node scripts/validate-theme.mjs themes/<your-id>
   ```
5. Open a pull request against `main` — **one theme per PR**.

## The CSS contract (enforced by CI)

Your `theme.css` may set **only** the colour tokens listed in
[`schema/allowed-tokens.json`](schema/allowed-tokens.json) (plus `color-scheme`),
on exactly one `[data-theme='<id>']` selector. No other selectors, no `@import`,
no external `url()` — the only `url()` allowed is the inline `data:` SVG on
`--select-arrow`. All **core** tokens are required; optional and per-region
tokens are not. The `validate` workflow checks every bit of this, so run it
before you push.

**`thumbnail.png` (or `.jpg`):** a **16:9 screenshot** of Psysonic with your
theme applied, **at least 1280×720** (aspect 1.5–1.85, source ≤ 6 MB). You don't
need to resize or convert — CI optimises it to a `thumbnail.webp` on merge.

## Naming & description

- **Display name** (`manifest.name`): keep it short. If your theme is inspired
  by a brand, film, or game, a trademark-safe / altered name is fine and
  encouraged.
- **Description** (`manifest.description`) is the store's **search anchor**, so
  **name the real inspiration** here — e.g. `Inspired by Winamp.` Someone
  searching "Winamp" should find it.
- Recolouring an existing open-source palette? **Credit the palette and its
  author** in the description (e.g. `… — recolour of the Nord palette by
  arcticicestudio`).
- Descriptions are in **English**.

## After you open the PR

The `validate` workflow runs on your PR. Once it is green and a maintainer has
had a quick visual look, it can be merged. `registry.json` is regenerated
automatically on merge — **never edit it by hand**.

## License

By submitting a theme you agree it is contributed under this repository's
[MIT License](LICENSE).
