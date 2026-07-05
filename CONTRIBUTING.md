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
5. Open a pull request against `main` — **one theme per PR** (so each theme gets
   its own validation and visual review, and a problem with one never blocks the
   others from merging).

## Updating an existing theme

When you change a theme that is already in the store, **bump `version` in its
`manifest.json`** (e.g. `1.0.1` → `1.0.2`). The in-app theme store detects
updates by comparing the version, so a change shipped with the same version is
never offered to users who already installed it. CI enforces this: a PR that
edits an existing theme without raising its version fails the `validate` check.

Consider adding a matching entry to the optional `changelog` object in
`manifest.json` (keyed by the new version) so users can see *what* changed in the
store's **What's new** — see the README for the shape.

## The CSS contract (enforced by CI)

`theme.css` is **free-form CSS** — any selectors, structure, `@media`, and
`@keyframes` are fair game. Recolouring the semantic tokens in
[`schema/allowed-tokens.json`](schema/allowed-tokens.json) on the
`[data-theme='<id>']` root is the recommended starting point — it recolours the
whole app in one place — but you are not limited to them. Themes can also react
to app state via same-element attributes on the root, e.g.
`[data-theme='<id>'][data-playing='true']` (also `data-fullscreen`,
`data-sidebar-collapsed`, `data-lyrics-open`).

The `validate` workflow does **not** police your design — only a small **safety
floor**. Quality and taste are handled by review. The floor is:

- **No network** — no `@import`, and every `url()` must be an inline `url(data:...)` URI.
- **No scripts** — no `expression()`, `javascript:`, `-moz-binding`, or `<style>` / `<script>`.
- **No `@property`** — it would register a global custom property that could clash.
- **Namespaced animations** — every `@keyframes` name must start with `<id>-`.
- **Size cap** — `theme.css` ≤ 256 KB.

Run the validator (see **Quick start** above) before you push.

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
