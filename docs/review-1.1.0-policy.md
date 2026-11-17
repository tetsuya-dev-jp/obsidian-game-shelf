# Game Shelf 1.1.0: independent Obsidian policy and API review

Scope: working tree on `feat/bilingual-notes`, reviewed and re-reviewed on 2026-11-17. I inspected the tracked working diff and new source/setup files, relevant callers, the installed `obsidian` declarations (`1.14.4`), the official ESLint configuration, the manifest, build configuration, and current README disclosures. This is a static review of production behavior and policy; it does not certify a release or native mobile operation. IGDB response parsing and release-date correctness belong to the separate correctness review.

## Final verdict

**Static policy/API review: pass, with no open finding in this scope.** Both P2 findings below were addressed in source. The additional plain-text source-description and explicit legacy-note language changes also match the stated security and preservation behavior on the inspected paths. The later narrow-modal CSS correction also passed a scoped source review. This verdict does not cover native mobile or final release artifacts.

## Resolved findings from the first review

1. **P2 — Resolved: online setting text omitted automatic external cover requests.** The earlier EN/JA descriptions claimed that only explicit searches/lookups used the network, while `src/view.ts:249-251,458` allowed remote covers on library render. `src/translations.ts:106-107,334-335` now names searches, connection tests, and remote previews, and explains that embedded note screenshots may still load through Obsidian. `onlineTitle` is now source-neutral in both languages (`src/translations.ts:23,251`; used at `src/view.ts:481`). The README already discloses the provider and image hosts (`README.md:197-225`).

2. **P2 — Resolved in source: commands were re-registered without removal.** `src/main.ts:125-127` now removes all four fixed IDs before `addCommand`, including when `src/main.ts:228` rebuilds localized names after an interface-language change. `Plugin.removeCommand` is available since 1.7.2 in the installed declaration (`node_modules/obsidian/obsidian.d.ts:7190-7197`), below the manifest minimum. The user reports nine native minimum-1.13.7 checks passed; their command-palette and unload evidence was not independently inspected in this review.

## Additional re-review

- **Provider prose:** `src/note-format.ts:134-140,195-199` escapes Markdown/HTML syntax in each source-description line while preserving line breaks. Both creation and preview call `sourceBody` (`src/notes.ts:264`, `src/view.ts:751`). The focused test at `tests/note-format.test.ts:254-264` covers an attempted remote image/link embed and template/script text. This closes the previously reported path for unsolicited images from source descriptions; deliberately selected media remain explicit embeds.
- **Legacy note language:** `src/notes.ts:70-87` treats a missing `note_language` as unresolved instead of inheriting the current interface language. `src/view.ts:866-895` gives the reader an explicit EN/JA choice, saved by `src/notes.ts:359-363`; `src/notes.ts:365-389` rejects a play-log write until the note itself stores a valid language. Rejection occurs within `Vault.process`, so the attempted journal/property update is not returned as modified content. The implementation verification report records nine passing native minimum-1.13.7 checks; this reviewer did not independently inspect that run.

## Final narrow-modal UI correction

**Scoped CSS review: pass.** A native 390px screenshot exposed squeezed credential labels beside their controls. `src/settings.ts:13` now adds `gs-igdb-setup` to the IGDB modal element. The `@media (max-width: 600px)` rules at `styles.css:737-750` stack only that modal's `.setting-item` rows, remove the info block's trailing margin, and allow control wrapping. The selector cannot affect the main settings tab or other plugin modals. Native `Setting` and `SecretComponent` controls remain intact. `Modal.modalEl` is present in the installed Obsidian declarations. The implementation agent is rerunning native CSS/new-class checks; visual success after this change has not yet been reported to this reviewer.

## Checks that passed or remain bounded

- **Minimum API version:** The installed declarations date `PluginSettingTab.getSettingDefinitions` and `SettingDefinitionItem` to 1.13.0, `SettingSecretControl` to 1.13.2, `SecretComponent` to 1.11.1 with `setValue`/`onChange` since 1.11.4, `Setting.addComponent` to 1.11.0, and `SecretStorage` to 1.11.4. These are below `manifest.json`'s `minAppVersion: 1.13.7`. This establishes API availability from the declarations, not a native 1.13.7 runtime test.
- **Secrets and data:** `src/settings.ts:120-123` uses the native `secret` control; the onboarding modal uses `SecretComponent` (`src/settings.ts:33-40`). `src/main.ts:61-65` resolves the stored reference through `app.secretStorage` only when making IGDB requests. `src/main.ts:213-218` saves settings, snapshots, and schemas; `src/note-format.ts:385` admits only a string reference for `igdbClientSecret`. The IGDB credential body goes to `id.twitch.tv` and the resulting bearer token goes to `api.igdb.com` (`src/igdb.ts:200-224`); the token is held in memory. I found no bundled shared credential, plugin-data token write, or log of the secret in the reviewed source. Obsidian's guide says SecretStorage is vault-local and keeps values out of plugin `data.json`; it does not promise encryption.
- **Policy and network:** README names the Twitch, IGDB, Games Never Die, and image hosts and explains account/credential requirements (`README.md:6-10, 194-225`). No plugin-owned server, client telemetry, dynamic ad, self-update, or outside-vault file access appeared in the reviewed production code. External screenshots embedded in notes can load through Obsidian rendering as disclosed in README. The build uses browser target and externalizes `obsidian`; Node appears in build tooling, not in the plugin source. `manifest.json` declares `isDesktopOnly: false`; that is a compatibility claim, not evidence of an iOS/Android run.
- **Lifecycle and controls:** View DOM listeners are registered on child `Component`s, replaced on rerender (`src/view.ts:258-262`) and owned by the view; `onClose` invalidates pending result IDs (`src/view.ts:86-90`). Plugin vault/workspace subscriptions use `registerEvent` (`src/main.ts:89-123`). The setup modal uses native `Setting` controls and a `SecretComponent`, and new search/library controls use native buttons and explicit input labels. These source checks do not replace keyboard/screen-reader or native mobile checks.
- **Static gates:** `git diff --check`, `eslint src --max-warnings 0`, and `tsc --noEmit` passed on the earlier re-reviewed tree. After the modal CSS change, `git diff --check`, `eslint src/settings.ts --max-warnings 0`, and `tsc --noEmit` also passed. This independent review did not run the test suite, native Obsidian, mobile, or inspect the release archive. The implementation verification report records nine passing native minimum-1.13.7 checks before the final CSS rerun; that result is not claimed as independently verified here.

## Official sources

- [Developer policies](https://docs.obsidian.md/community-directory/developer-policies): README disclosure of required accounts and network use; no client telemetry or self-update.
- [Store secrets](https://docs.obsidian.md/plugins/guides/secret-storage): `SecretComponent` and secret-reference storage pattern.
- [Submission requirements for plugins](https://docs.obsidian.md/community-directory/submission-requirements-for-plugins): minimum app version and desktop-only/Node distinction.
- [Manage plugin lifecycle](https://docs.obsidian.md/plugins/guides/lifecycle-management): component ownership and cleanup.
- [Obsidian October plugin checklist](https://docs.obsidian.md/oo/plugin): mobile and API review prompts. The requested legacy `Plugins/Releasing/Plugin+guidelines` URL currently returns Not Found in the documentation browser, so I used the live checklist and current policy/submission pages instead; checklist guidance is not automatically a mandatory directory policy.

## Final implementation verification addendum

After this static review, the final build passed all nine native fixture checks
on both 1.13.7 and 1.15.1. The 390px EN/JA guide check verified stacked controls,
wide labels, scrollable content and no horizontal overflow; the captured
Japanese guide was inspected visually. See the linked version and layout
reports in [verification](verification.md). These execution results belong to
the implementation verification, not an independent native run by this reviewer.
