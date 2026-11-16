# Game Shelf 1.0.1

Addresses the automated Community-directory review of version 1.0.0.

- Parse provider text in an inert document fragment without creating a wrapper element.
- Replace `:has()` layout selectors with an explicit Discover-view class.
- Remove `!important` declarations and `clip-path` while preserving pane spacing
  and cover-image fallbacks.
- Generate GitHub build-provenance attestations for all three installable assets
  before publishing from the release workflow.
- Document cached vault-wide indexing, which preserves moved and renamed game notes.

Install `main.js`, `manifest.json` and `styles.css` in your vault's
`<config folder>/plugins/game-shelf/`, or add this repository through BRAT.
Community-directory approval is separate from this release.
