# Verification

## Version 1.1.1: global note language simplification (2026-11-18)

Note creation and new play-log entries now use the global **Note language**
setting. New notes no longer write language metadata. The per-note language
selector and the save gate for older notes have been removed. Existing
`note_language` values are ignored; existing prose, previous entries and custom
properties are retained.
Retired language mappings are discarded when loading saved settings and
property profiles, preserving the remaining mappings.

The updated [native bilingual suite](../e2e/bilingual.mjs) checks global English,
Japanese and automatic settings across existing notes; absent, English and
unsupported stored language values; new notes without language metadata;
consecutive UI saves; retained prose, provider identity and property-name
profiles across reload. Results are in the
[language simplification report](verification-language-simplification.json).
Earlier versioned reports below describe the behavior of those releases.
All 57 unit tests, lint, TypeScript checks, build and release validation passed.
All nine native scenarios passed on isolated Obsidian desktop 1.15.1 and the
minimum supported 1.13.7
([minimum-version report](verification-language-simplification-1.13.7.json)).
The independent [static review](review-1.1.1.json) found no actionable security
or logic issues. The production dependency audit reported zero vulnerabilities.

## Mobile layout follow-up (2026-11-18)

The [mobile regression suite](../e2e/mobile.mjs) runs the built plugin inside
isolated Obsidian desktop with synthesized touch input and mobile control CSS.
The [report](mobile-checks.json) records English/Japanese checks across 12
viewports from 320×568 to 1440×1000, including portrait/landscape tablets and
phone landscape. It covers library/grid/list, details, manual creation, search,
preview and returning to results.

Checks reject horizontal overflow, clipped action labels, short touch targets
and input fonts below 16px. Synthesized touch events create notes, scroll the content
without moving the header, and save journal text plus 17 minutes through the
native vault/cache. Rotation preserves the draft; a 390×420 viewport checks
save-button reachability with reduced space. Floating-navigation padding and a
light-theme tablet layout are checked separately. Missing covers use icons
instead of squeezing duplicate titles into small placeholders.

These are desktop Chromium emulations. They do not verify a real software
keyboard, iOS rubber-banding, native mobile navigation or physical devices.
The installed Linux WebKit could not launch because required shared libraries
(including ICU 74) are missing, so Safari/WebKit behavior remains unverified.
No system dependencies were installed for this check.

## Version 1.1.0

The English/Japanese update passed 56 unit tests, official Obsidian lint rules,
TypeScript checks, build and release validation. The production dependency audit
reported zero vulnerabilities. No dependency was added for this update.

Online search is enabled by default for new installations. The follow-up
[native check](verification-1.1.0-online-default.json) used a fresh 1.15.1 vault
with no saved plugin data: English opens the credential guide directly, Japanese
opens the search form, and a saved offline choice survives plugin reload.
A continuous native recording shows the English setup guide, Obsidian's secret
input dialog and manual entry without entering credentials or making auth/API
requests. The 56-test check also verifies the new default and retained saved OFF.

The [native test script](../e2e/bilingual.mjs) passed all nine scenarios on real
Obsidian desktop **1.15.1** ([report](verification-1.1.0.json)) and the minimum
supported **1.13.7** ([report](verification-1.1.0-min.json)) in an isolated vault:

- English and Japanese native credential guides and official links.
- Missing-credential setup gate and zero requests while offline.
- Japanese interface creating an English IGDB note through search and preview.
- Stable per-note English/Japanese log units, manual notes and duplicate identity.
- Refresh preserving personal edits and rejecting another provider's identity.
- Legacy notes refusing writes until the user explicitly chooses a language.
- Four localized commands remaining unique and executable through EN→JA→EN.
- No synthetic secret or token values in plugin data or generated notes.
- Custom property mappings and note language surviving plugin reload.

These checks use synthetic credentials, API responses and images. They verify
native UI, persistence and integration, not authenticated upstream availability.
No real user secret was accessed. Native iOS/Android execution was not tested.
Narrow desktop setup controls are checked separately in the
[layout report](verification-1.1.0-layout.json). A native 1.15.1 reading-view
check also decoded both GND and IGDB local covers and verified the same
144px/192px size limits. These are not mobile runs.

Independent [correctness/security](review-1.1.0-security.md) and
[Obsidian policy/API](review-1.1.0-policy.md) re-reviews passed after fixing the
recorded findings. This does not constitute approval by the Obsidian team.
The [1.1.0 release](https://github.com/tetsuya-dev-jp/obsidian-game-shelf/releases/tag/1.1.0)
is public. Its source passed Windows, macOS and Linux CI, and the release
workflow completed successfully. All three published assets were downloaded
and compared directly with the tested local files; they are identical. See
[release verification](release-verification-1.1.0.json) for source, workflow and
asset details, including the limits of the checks.

To reproduce, start the isolated harness with `OBSIDIAN_BINARY`, run
`node e2e/bilingual.mjs`, then stop it with `node e2e/launch.mjs stop`.
The script writes `verification-1.1.0.json`; preserve each version's report
before running another version.

## Version 1.0.3

Screenshot links are now Markdown image embeds separated by blank lines.
New installations include media by default; saved selections are preserved.
All 35 unit tests, lint, types and build passed. Native fixture checks on
Obsidian 1.15.1 under xvfb verified two 640 × 360 screenshot images in each
cover-saving mode. Screenshots remain remote even when covers are saved
locally. Provider responses and cover downloads were synthetic in these checks;
live provider availability and native mobile execution were not rechecked.

## Version 1.0.2

The [1.0.2 release](https://github.com/tetsuya-dev-jp/obsidian-game-shelf/releases/tag/1.0.2)
removes the document-fragment construction still flagged in the supplied
1.0.1 review. Provider text is extracted from an element cloned within its
inert document, preserving script/style/SVG/hidden-node filtering.
The parser-specific lint gate was checked against the 1.0.1 source: it rejects
that fragment call and accepts the corrected code. All 34 unit tests, lint,
types and build passed, along with the [15 native acceptance checks](verification-1.0.2.json)
on Obsidian 1.15.1. The source passed Linux, Windows and macOS CI, and all three
downloaded release assets match the tested local files with verified source/tag/
workflow-bound attestations. See [release verification](release-verification-1.0.2.json).
The official 1.0.2 verdict has not been observed; browser integration was
disconnected when checked. Mobile execution and additional visual checks were
not repeated for this parser-only change.

## Version 1.0.1

The [1.0.1 release](https://github.com/tetsuya-dev-jp/obsidian-game-shelf/releases/tag/1.0.1)
addresses the automated Community-directory source/CSS warnings. Its source
passed Linux, Windows and macOS CI; all three published assets match the tested
local files and their attestations verify against the source commit, release
tag and workflow. See [release verification](release-verification-1.0.1.json).
Fresh native acceptance, layout and narrow-control checks are linked from
[review responses](official-review.md). The directory's new review is pending.

## Version 1.0.0 baseline

The authoritative native-run results are in [verification.json](verification.json).
The reproducible checks are in [e2e/acceptance.mjs](../e2e/acceptance.mjs).
The same 15 acceptance checks passed on both Obsidian **1.13.7**
([minimum-version report](verification-min.json)) and **1.15.1**
([current-version report](verification.json)).
The public [1.0.0 release](https://github.com/tetsuya-dev-jp/obsidian-game-shelf/releases/tag/1.0.0)
and all three downloaded assets are checked in
[release-verification.json](release-verification.json). The release's source
commit passed the [three-OS CI run](https://github.com/tetsuya-dev-jp/obsidian-game-shelf/actions/runs/43368257543).

## Scope

- Real Obsidian desktop on Linux, in an isolated vault under `e2e/.runtime/` and
  a private temporary user-data directory, launched with xvfb.
- Live Games Never Die searches/details and local cover downloads. Personal
  journal text and status/rating examples are demonstration data.
- Native YAML indexing, local image decode, duplicate/same-title editions,
  journal totals, user-edited fields and stale-preview refusal.
- Dark/light themes, keyboard focus and narrow-pane layout are captured from
  the native renderer. Narrow desktop captures are not native mobile tests.
- Offline parser/domain tests and official lint/type/build gates run separately
  in CI. CI does not repeatedly scrape the upstream site.

## Reproducing the native checks

Start the isolated harness with the documented `OBSIDIAN_BINARY`, trust only its
dedicated test vault, and use its Game Shelf UI to add these two source games:
`the-legend-of-zelda-ocarina-of-time--1` and
`the-legend-of-zelda-ocarina-of-time`. Enable local cover saving, then run
`node e2e/acceptance.mjs --live`. The checks use these notes as fixtures, restore
their content afterward, and trash only the temporary notes they create.
The published screenshots also include five other individually selected demo
games. The runtime vault/profile is excluded from Git.

The eight captured views have no horizontal overflow and no violations found by
axe-core 4.14's WCAG A/AA rules; see [visual-checks.json](visual-checks.json).
This automated result does not establish complete accessibility or native phone
compatibility. A fresh, independent visual review is recorded separately.
The narrow completion check also creates a real manual note with a Chromium
Enter key event and saves a session with Chromium mouse events. Both buttons
are fully visible and uncovered after scrolling; saved text and 17 total
minutes are verified through the native vault/cache, then the temporary note
is trashed. See [narrow-checks.json](narrow-checks.json).

## Dependency audit

`npm audit --omit=dev` reported **0 vulnerabilities**. The complete development
tree still reports 10 moderate findings through `minimatch` in lint tooling;
there are no high or critical findings. These tools are not bundled in the
plugin. The suggested automatic fix downgrades the official Obsidian lint
plugin, and a forced major-version override violated another dependency's
declared range, so neither was retained. Recheck before updating the toolchain.

## Review trail

User research: [user-research.md](user-research.md).
Independent data-integrity review: [review-security.md](review-security.md).
Corrections and further review outcomes are appended there; an original finding
is not automatically evidence that the final build still has the issue.

No claim is made that this plugin is optimal for every user, that source game
facts are officially verified, or that community-directory acceptance is
guaranteed. Network performance depends on the source and connection.
