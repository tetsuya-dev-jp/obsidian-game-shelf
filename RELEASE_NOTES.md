# Game Shelf 1.1.3

Fix the create-note button floating over the form on phones and tablets,
including while the software keyboard is open.

- Place **Create note** after the form so it scrolls with the content.
- Remove the sticky-button space reservation from focused-field scrolling.
- Keep keyboard input visibility, native date pickers and the normal header
  behavior from 1.1.2.

Validation uses isolated Obsidian desktop with its mobile UI and simulated
keyboard space. Physical iPhone/iPad/Android keyboards remain untested.

Update Game Shelf in **Settings → Community plugins**. For manual installation,
download `main.js`, `manifest.json` and `styles.css` into your vault's
`<config folder>/plugins/game-shelf/`. Requires Obsidian 1.13.7 or later.
