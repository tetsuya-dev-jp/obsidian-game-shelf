# Game Shelf 1.1.0

Create English game notes with IGDB or Japanese game notes with Games Never
Die. The interface and new-note language can be selected independently.
Headings, media labels, validation messages, setup instructions and play-log
units support English and Japanese. Source text is retained as supplied;
missing translations are not invented.

IGDB uses your own Twitch Client ID and Client Secret, with an in-app guide in
both languages and a connection test. There is no Game Shelf server or shared
application key. The secret is accessed through Obsidian SecretStorage; only its
reference is saved in plugin settings. Access tokens stay in memory.
See [the setup guide](docs/igdb-setup.md).

New installations follow Obsidian's interface language, use that language for
new notes, and choose GND for Japanese or IGDB for English. Online search is on
by default; credentials are empty until configured. Existing saved preferences are
preserved. IGDB does not provide the GND-specific articles or Steam statistics.

Each note keeps its own writing language and source identity. Changing defaults
does not rewrite existing notes or switch their refresh source. For pre-1.1.0
notes, choose the note's writing language in its library detail before adding
another play-log entry. This changes the language property, not existing prose.
Source descriptions are saved as plain text to prevent unselected Markdown
embeds. Refresh still protects personal edits and refuses cross-source changes.

Validation: 56 unit tests, official Obsidian lint rules, types, build and release
checks passed. Nine native fixture scenarios passed on Obsidian 1.13.7 and
1.15.1, including bilingual setup, cross-language note creation, per-note logs,
legacy language selection, localized commands, credential persistence checks,
refresh protection and custom properties across reload. Independent static
security and Obsidian policy re-reviews passed after corrections.
Authenticated live IGDB requests and native iOS/Android execution remain untested.

Install or update Game Shelf from **Settings → Community plugins** when the
plugin is available in your directory. For manual installation, download
`main.js`, `manifest.json` and `styles.css` from this release into your vault's
`<config folder>/plugins/game-shelf/`. Requires Obsidian 1.13.7 or later.
