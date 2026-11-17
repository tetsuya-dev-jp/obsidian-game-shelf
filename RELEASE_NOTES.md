# Game Shelf 1.0.3

Screenshots in newly created game notes now appear as images instead of
clickable text links, with a blank line between each image. New installations
include screenshots and trailers by default; trailers remain links.

Image embedding works with local cover saving turned on or off. The offline
option saves only the cover; screenshots remain remote images and require a
network connection when the note is rendered.

Existing notes, saved field selections and custom templates are preserved.
If screenshots are disabled in your saved settings, enable **Screenshots and
trailers** under **Include in note** when creating a note.

Validation: 35 unit tests, lint, type checks and build passed. Native fixture
checks on Obsidian 1.15.1 verified two screenshot embeds in each cover-saving
mode. These checks used synthetic images rather than live provider downloads;
native mobile execution was not repeated.

Install or update Game Shelf from **Settings → Community plugins** in Obsidian.
For manual installation, download `main.js`, `manifest.json` and `styles.css`
from this release into your vault's `<config folder>/plugins/game-shelf/`.
