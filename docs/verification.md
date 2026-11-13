# Verification

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
