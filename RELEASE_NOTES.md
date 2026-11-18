# Game Shelf 1.1.2

This update fixes mobile input visibility and follows up on phone and tablet
layout issues reported after 1.1.1.

- Keep the focused field visible when the software keyboard or available view
  size changes. Use Obsidian's native view scroller instead of nested scrolling.
- Keep the header visible during normal scrolling. In short keyboard viewports,
  let the header and create action scroll away so fields remain usable.
- Prevent the sticky create button from covering focused form controls.
- Remove iOS date fields' native minimum-width behavior and use a single-column
  personal-information form in narrow detail panes. Empty and populated dates
  remain native date-picker controls.
- Wrap long action labels and hostnames when text is enlarged. Constrain settings
  and credential-guide controls, with input text of at least 16px on mobile.

Existing notes and play logs are preserved. No migration or new credential
requirement is introduced.

Validation uses isolated Obsidian desktop with its mobile UI, simulated keyboard
space, synthesized touch, multiple screen sizes, enlarged text and both themes.
These checks do not replace physical iPhone/iPad/Android or real software-keyboard
testing. The reported device was an iPhone 13 mini, iOS 27.2, Obsidian 1.15.1;
that device was not connected to the automated test environment.

Update Game Shelf in **Settings → Community plugins**. For manual installation,
download `main.js`, `manifest.json` and `styles.css` into your vault's
`<config folder>/plugins/game-shelf/`. Requires Obsidian 1.13.7 or later.
