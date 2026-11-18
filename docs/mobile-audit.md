# Mobile input and layout follow-up — 1.1.2

## Report and reproduction

The user reported disappearing input fields and overflowing date fields on an
iPhone 13 mini, iOS 27.2, Obsidian 1.15.1. Their recording shows the library and
online-search content disappearing after the software keyboard opens, while
the Game Shelf header remains visible. A separate image shows date fields
extending outside their columns.

The whole-content disappearance was not reproduced on physical hardware here.
The isolated desktop app's built-in mobile UI did reproduce a related failure:
after keyboard space reduced the view by 344px, the focused journal field stayed
below the visible area. A second regression placed a focused manual-entry select
under the sticky create action. These tests failed before their respective fixes.

In the original failing journal case at 375x812, the focused field occupied
y=461.6–594.3 after keyboard space opened, below the visible bottom at y=434.
The follow-up select case was hit-tested under the create button rather than
the focused select. The regression checks now reject both conditions.

## Changes

- Use the native `.view-content` as the sole vertical scroller, with a sticky
  header. Preserve the previous reset-to-top behavior when changing screens.
- Reveal a focused input after container or visual-viewport resize. Reserve
  bottom navigation, safe-area and sticky create-action space. Preserve focus
  and typed values; do not rebuild the form for keyboard changes.
- In a short view, let the header and create action scroll normally so they do
  not consume the entire editing area. Restore sticky positioning after focus
  leaves or space returns.
- Remove native date-control appearance while retaining `type="date"`, and
  switch personal fields to one column below a 480px detail-content width.
- Allow long icon-button labels to wrap. Wrap hostnames in offline help and the
  credential guide when text is enlarged.
- Scope mobile control sizing to Game Shelf settings and the credential guide.
  Keep input text at least 16px. Invisible native dropdown measuring elements
  must not create a horizontal settings scroller; visible controls and readable
  text are checked independently for clipping.

The date-control change addresses the native-control sizing path described in
[WebKit's iOS date input width report](https://bugs.webkit.org/show_bug.cgi?id=301648).
That upstream report is not evidence of a successful test on this user's device.

## Automated evidence

The native runs use the existing isolated test vault and a separate temporary
Obsidian profile under xvfb. No personal vault was changed.

| Check | Coverage | Evidence |
| --- | --- | --- |
| Unit/static/build | 57 tests, ESLint, TypeScript, browser bundle, release-file consistency | `npm run check` |
| Original responsive/touch suite | 127 Japanese/English layouts; 12 viewport sizes; create, play-log save, rotation, vertical scrolling, fixed header, no horizontal pan, source preview and back | [report](mobile-checks.json), [script](../e2e/mobile.mjs) |
| Actual host mobile UI audit | 264 layouts across 10 viewport sizes, both languages/themes, text scales 1/1.5/2; library with real cards, details, manual entry, offline state, settings and credential guide | [report](mobile-audit-checks.json), [script](../e2e/mobile-audit.mjs) |
| Keyboard audit | 24 portrait/landscape keyboard cases across the same language/theme/text-scale combinations; focused title and select remain reachable | [report](mobile-audit-checks.json) |
| Input and persistence | Eight focused text/number/select controls; keyboard open/close; exact typed values and subsequent typing; actual saved log and 172-minute metadata-cache value; empty/populated dates at six widths | [report](mobile-input-checks.json), [script](../e2e/mobile-inputs.mjs) |
| Bilingual compatibility | Nine source/language/refresh/persistence scenarios using synthetic network responses and credentials | [report](verification-1.1.2-bilingual.json) |
| Linux WebKit 27.2 | Eight layout snapshots of actual Obsidian mobile DOM/CSS, including empty and populated date controls | [report](mobile-webkit-checks.json) |
| Independent code review | Corrected sticky-action overlap and exact test-state/theme restoration; final review found no actionable security or logic issues | [review](review-1.1.2.json) |

The expanded audit checks visible control bounds, readable text ranges, touch
heights, input font sizes and actual scroll containers. It excludes invisible
native measuring controls from visible-element checks and waits for modal close
animations before interacting with underlying fields.

The focused-input/persistence suite and all nine bilingual compatibility checks
also passed on the minimum supported Obsidian 1.13.7:
[input report](mobile-input-checks-min.json),
[bilingual report](verification-1.1.2-bilingual-min.json).

## Limits

Desktop mobile emulation and Linux WebKit do not reproduce iOS native date
widgets, real software keyboards, IME behavior, Safari's focus zoom/compositing,
or hardware touch behavior. The supplied recording is real-device evidence of
the original defect; it is not evidence that this patch passed on that device.
Physical iPhone/iPad/Android testing and arbitrary community themes remain
unverified. Source-network tests use fixtures; live authenticated IGDB was not
retested. No additional system libraries were installed; WebKit compatibility
libraries were extracted only into the task's temporary directory.
