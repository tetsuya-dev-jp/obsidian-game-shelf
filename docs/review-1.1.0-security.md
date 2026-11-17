# Release 1.1.0 correctness and security review

Current verdict after re-review: **pass**, subject to the live-API and minimum-version verification limits below. The original failed verdict and findings are retained as review history.

## Original review (historical verdict: fail)

The two findings below affected the stated content-sanitization and existing-note language requirements at the time of the initial source review. That review covered the working-tree diff, the new IGDB and translation modules, and their callers; no authenticated IGDB call or native Obsidian run was performed.

## Blocking findings

1. **Remote descriptions can add active Markdown embeds to saved notes** (`src/igdb.ts:141-143`, `src/note-format.ts:195-203`, `src/notes.ts:261-268`). An IGDB summary such as `Read this ![](https://example.org/track?game=42)` survives `gameOf` and `sourceBody`: the former removes HTML tags, while the latter escapes HTML characters and backticks but leaves Markdown image syntax intact. Creating a note with the description group saves the image embed, and rendering the note loads the remote URL without the user selecting a media item. The same sink also processes GND descriptions. Escape Markdown syntax in source prose while retaining intended paragraph breaks before inserting it into a note. Add a focused test using image and link syntax in a provider description.

2. **Legacy notes change writing language for new play-log entries after an interface-language change** (`src/notes.ts:70-87`, `src/notes.ts:359-375`, `src/note-format.ts:330-347`). Notes created before 1.1.0 have no `note_language`. `schema()` assigns them `noteLanguage: 'auto'`, so `session()` resolves the *current* interface language. For example, an existing English-headed GND note created under an English interface receives a Japanese `分` unit if the user later selects Japanese UI, even though its existing headings remain English. This contradicts the promised stable per-note language. Preserve a deterministic legacy language for these notes, or derive it from an existing reliable per-note marker; do not silently follow new defaults.

## Checked paths and limits

- IGDB credentials are read through `SecretStorage`; the client secret is sent in the Twitch token POST body and the access token in the IGDB Authorization header. The reviewed code does not persist tokens or include them in note metadata. Token and response errors shown to users use sanitized error types.
- Provider-prefixed IDs, per-note property mappings, refresh identity checks, and stale-value checks protect source identity and personal properties in the inspected paths.
- The official `release_region.region` and date-format work was being changed concurrently and is excluded from the final findings here. No live IGDB response was available to validate it.
- New tests and native verification were in progress elsewhere; this review did not rerun them.

## Final re-review

**Verdict: pass. No remaining blocking correctness, security, or data-integrity finding in the inspected final source.**

1. **Remote-description finding resolved.** `src/note-format.ts:134-140,195-199` now escapes each description line with `markdownText` and rejoins the lines, preserving paragraphs while neutralizing image/link and Obsidian embed syntax. Both creation and preview use `sourceBody` (`src/notes.ts:261-268`, `src/view.ts:748-754`). `tests/note-format.test.ts:254-264` covers a hostile image URL, a link, newlines, and template/script openers. This removes the previously identified implicit external load from description prose.

2. **Legacy-language finding resolved without rewriting old prose.** New notes save `note_language`; older notes without it show an explicit language choice (`src/view.ts:865-898`) and have the journal submit disabled until selected (`src/view.ts:963-969`). `NoteStore.setLanguage` writes the mapped property through `Vault.process` (`src/notes.ts:359-364,390-401`). `NoteStore.session` checks the actual file content for `en` or `ja` inside the same atomic update and rejects unresolved notes before changing properties or body (`src/notes.ts:365-388`). The native fixture reports the rejection left the file unchanged, followed by a saved English log after explicit selection (`e2e/bilingual.mjs:176-196`; `docs/verification-1.1.0.json`).

3. **IGDB source and refresh paths checked.** The query uses the documented `release_dates.release_region.region` and `release_dates.date_format.format` fields (`src/igdb.ts:10`); the parser keeps year, month, quarter, full-date and TBD precision rather than inventing a day (`src/igdb.ts:101-123`). The inspected local official schema lists those nested fields and formats. ID-based lookup, provider-prefixed note IDs, SecretStorage resolution, in-memory token use, sanitized response errors, and refresh identity/stale-value checks remain intact (`src/igdb.ts:157-285`, `src/main.ts:55-67`, `src/notes.ts:403-438`). The synthetic native fixture reports source identity, personal edits, body text, stored secret boundaries, and mapped property profiles preserved (`docs/verification-1.1.0.json`).

**Verification and limits.** Targeted `igdb`, `note-format`, and `i18n` unit suites passed: 3 files, 41 tests. `git diff --check` passed. The available native report uses a synthetic IGDB network on Obsidian 1.15.1; an authenticated live IGDB response and the planned Obsidian 1.13.7 fixture were unavailable to this re-review. These are verification limits, not observed failures.
