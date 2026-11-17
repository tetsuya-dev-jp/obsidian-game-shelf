# Game Shelf 1.0.2

Addresses the remaining DOM-helper warning from the automated
Community-directory review of version 1.0.1.

- Clone provider elements within their inert document without creating wrapper
  elements or document fragments.
- Preserve the removal of executable, decorative and hidden text, including
  a hidden root element.
- Enforce the parser's DOM-construction restriction locally so this warning
  cannot silently pass the local lint checks again.

Vault-wide indexing remains intentional: it uses cached frontmatter to find
moved or renamed game notes without reading note bodies. Release-asset
attestations and the CSS fixes from 1.0.1 remain in place.

Install `main.js`, `manifest.json` and `styles.css` in your vault's
`<config folder>/plugins/game-shelf/`, or add this repository through BRAT.
Community-directory approval is separate from this release.
