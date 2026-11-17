# Automated Community-directory review responses

The supplied review is dated 2026-11-16 and covers release 1.0.0, commit
`355ea07`. The entry was still a draft. These responses describe the published
[1.0.1 release](https://github.com/tetsuya-dev-jp/obsidian-game-shelf/releases/tag/1.0.1).
Downloaded assets and attestations were verified; see
[release verification](release-verification-1.0.1.json).

## Follow-up review of 1.0.1

The newly supplied completed review of 1.0.1, commit `c945cbb`, confirms verified
attestations, no dependency vulnerabilities and a reproduced build. The earlier
CSS warnings are absent. The DOM-helper warning at `src/source.ts:16` remains:
the previous replacement with `createDocumentFragment()` did not resolve it.
The local lint pass was insufficient evidence of the official scanner's result.

The published [1.0.2 release](https://github.com/tetsuya-dev-jp/obsidian-game-shelf/releases/tag/1.0.2)
removes wrapper construction entirely. `importNode()` clones
only the requested element within its original inert document. Filtering still
excludes executable, decorative and hidden text, including a hidden root.
A parser-specific lint restriction rejects native element/fragment construction
even when the installed typed Obsidian rule misses it. An explicit regression
check rejects the 1.0.1 source at line 16 and accepts the corrected parser.

Version 1.0.2 checks passed: 34 unit tests, ESLint, TypeScript, browser build,
release consistency, production dependency audit and all 15 native Obsidian
1.15.1 acceptance checks. See [native results](verification-1.0.2.json).
The source passed Linux, Windows and macOS CI. The release workflow succeeded;
all three published assets match the tested local files and have verified
attestations bound to commit `9388494`, tag `1.0.2` and the release workflow.
See [release verification](release-verification-1.0.2.json).
The 1.0.2 directory rescan has not yet been observed because the owner's browser
extension was disconnected during the verification attempt. The vault-enumeration
recommendation remains intentional for moved-note discovery, as described below.

## Findings and implementation responses

| Finding | Response |
| --- | --- |
| DOM-helper warning, `src/source.ts:16` | The fragment replacement in 1.0.1 still triggered the official warning. Version 1.0.2 removes wrapper construction and clones only the source element in its inert document, preserving filtering and source nodes. |
| `clip-path`, `styles.css:654` | Remove the rule. Cover fallbacks are decorative inside an `aria-hidden` container and can use `display: none` after image loading, then return on an image error. |
| Six `!important` declarations | Remove all six. Scope pane padding to `.view-content.gs-root`, give the result-count selector enough specificity, and remove the obsolete visually-hidden declarations. |
| Two `:has()` selectors | Use an explicit `.is-discover` class set by the view, including the narrow-pane container query. |
| Missing attestations for `main.js` and `styles.css` | Add `actions/attest@v4` after checks and before release publication, with `id-token` and `attestations` write permissions. Include all three assets: `main.js`, `manifest.json`, `styles.css`. The release workflow succeeded and all three downloaded assets passed verification against its identity, the source commit and the `1.0.1` tag. |
| Vault enumeration recommendation | Retain the one cached Markdown-path enumeration needed to discover game notes moved outside the creation folder. Index from Obsidian's cached frontmatter without reading bodies; retain only recognized Game Shelf entries. Document the access and purpose in README. A native check confirms cold-index discovery of a moved note, exclusion of an unrelated note and zero note-body reads. This behavioral recommendation can remain visible in future scans. |
| Vault writes, dependencies and reproducible build passed | The supplied 1.0.1 rescan confirms these passes. Preserve the existing write safeguards and browser build; the 1.0.2 directory check remains unobserved. |

The attestation setup follows [GitHub's current documentation](https://docs.github.com/en/actions/how-tos/secure-your-work/use-artifact-attestations/use-artifact-attestations).
Verify each downloaded asset after release, for example:

```sh
gh attestation verify main.js --repo tetsuya-dev-jp/obsidian-game-shelf
gh attestation verify manifest.json --repo tetsuya-dev-jp/obsidian-game-shelf
gh attestation verify styles.css --repo tetsuya-dev-jp/obsidian-game-shelf
```

## Version 1.0.1 verification

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
themes were not tested. The release source passed GitHub-hosted Linux, Windows
and macOS CI, and the release workflow and downloaded-asset attestation checks
passed. The supplied official 1.0.1 rescan is summarized above.
