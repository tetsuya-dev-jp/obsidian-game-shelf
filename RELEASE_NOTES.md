# Game Shelf 1.1.1

This update improves phone and tablet layouts and simplifies note language
settings.

- Keep the header in place while scrolling the library or details vertically.
  Prevent horizontal overflow and contain scroll gestures within Game Shelf.
- Use a single pane at widths of 960px or less, including portrait tablets and
  split views. Reflow narrow forms, keep button labels readable, and constrain
  date fields and filters to the available width.
- Increase touch controls to at least 44px high, use at least 16px input text,
  and reserve space for Obsidian's floating navigation and bottom safe area.
  Missing covers now show a gamepad icon instead of squeezed title text.
- Use the global **Note language** setting for new notes and new play-log
  entries. Remove per-note language metadata, the language selector in details,
  and the language-selection requirement for older notes. Existing
  `note_language` properties are ignored and left intact. Existing prose,
  previous entries, source identity and property-name profiles are preserved.
- Keep the journal ready for another entry after saving.

Validation: 57 unit tests, lint, TypeScript checks, build and release checks
passed. Nine native fixture scenarios passed on isolated Obsidian desktop
1.13.7 and 1.15.1. Another 127 layout checks covered English/Japanese phone and tablet
sizes, synthesized touch input, saved journal content and draft retention
after rotation. These desktop emulations are not native mobile tests;
iOS/Android hardware, Safari/WebKit and real software keyboards remain
unverified. Authenticated live IGDB requests were not retested.

Install or update from **Settings → Community plugins** when Game Shelf is
available in your directory. For manual installation, download `main.js`,
`manifest.json` and `styles.css` into your vault's
`<config folder>/plugins/game-shelf/`. Requires Obsidian 1.13.7 or later.
