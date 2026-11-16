# Automated Community-directory review responses

The supplied review is dated 2026-11-16 and covers release 1.0.0, commit
`355ea07`. The entry was still a draft. These responses describe the local
1.0.1 update; they do not claim a new directory verdict or published release.

| Finding | Response |
| --- | --- |
| `document.createElement`, `src/source.ts:16` | Replace the wrapper element with a document fragment owned by the inert parsed document. Text extraction still removes scripts, styles, SVG and hidden nodes without modifying source nodes or moving provider markup into the active document. |
| `clip-path`, `styles.css:654` | Remove the rule. Cover fallbacks are decorative inside an `aria-hidden` container and can use `display: none` after image loading, then return on an image error. |
| Six `!important` declarations | Remove all six. Scope pane padding to `.view-content.gs-root`, give the result-count selector enough specificity, and remove the obsolete visually-hidden declarations. |
| Two `:has()` selectors | Use an explicit `.is-discover` class set by the view, including the narrow-pane container query. |
| Missing attestations for `main.js` and `styles.css` | Add `actions/attest@v4` after checks and before release publication, with `id-token` and `attestations` write permissions. Include all three assets: `main.js`, `manifest.json`, `styles.css`. Actual attestations require the GitHub release workflow to run. |
| Vault enumeration recommendation | Retain the one cached Markdown-path enumeration needed to discover game notes moved outside the creation folder. Index from Obsidian's cached frontmatter without reading bodies; retain only recognized Game Shelf entries. Document the access and purpose in README. A native check confirms cold-index discovery of a moved note, exclusion of an unrelated note and zero note-body reads. This behavioral recommendation can remain visible in future scans. |
| Vault writes, dependencies and reproducible build passed | Preserve the existing write safeguards and browser build. A new directory build-reproduction check remains pending publication. |

The attestation setup follows [GitHub's current documentation](https://docs.github.com/en/actions/how-tos/secure-your-work/use-artifact-attestations/use-artifact-attestations).
Verify each downloaded asset after release, for example:

```sh
gh attestation verify main.js --repo tetsuya-dev-jp/obsidian-game-shelf
gh attestation verify manifest.json --repo tetsuya-dev-jp/obsidian-game-shelf
gh attestation verify styles.css --repo tetsuya-dev-jp/obsidian-game-shelf
```

## Verification

- `npm run check`: official ESLint rules with zero warnings, 33 unit tests,
  TypeScript and browser build, and release-file/version consistency passed.
  Exclude the local `.audit/` download directory from ESLint so archived bundles
  do not invalidate the source check.
- `npm audit --omit=dev --audit-level=moderate`: zero vulnerabilities.
- `actionlint .github/workflows/release.yml`: passed. Local assertions confirmed
  attestation ordering, permissions, all three subjects, and absence of all
  reported CSS constructs.
- Native Obsidian 1.15.1: all 15 acceptance checks passed, including live search,
  duplicate/edition safety, journals, YAML comments, concurrent edits and the
  offline network toggle. See [acceptance results](verification-review.json).
- Native layout checks cover both themes, Library/Discover, 1440px and 390px
  viewports, with no horizontal overflow, correct grid columns, 28px bottom
  padding and 12px result-count spacing where present. Cover fallback load/error
  transitions and cached-only moved-note indexing passed. See
  [1.15.1 results](review-layout.json) and [1.13.7 results](review-layout-min.json).
- Narrow native keyboard creation and mouse journal save passed; both controls
  were visible and uncovered, with the saved text and 17-minute total verified
  through the real vault/cache. See [narrow results](review-narrow.json).

Native checks used the existing isolated test vault and separate temporary
profiles on Linux under xvfb. Native iOS/Android and arbitrary third-party
themes were not tested. GitHub-hosted execution, actual attestation verification,
and the official 1.0.1 rescan remain pending release publication.
