# User research: game notes and media libraries in Obsidian

Reviewed 2026-11-13. This is a qualitative scan of first-person posts and issue reports, not a survey. The cited comments concern existing Obsidian workflows and other plugins; none tests Game Shelf or Games Never Die. Product readmes below are reference implementations, not evidence of user demand.

## Observed needs and friction

| User evidence (paraphrased) | Design implication |
| --- | --- |
| A game-library owner keeps screenshots, guides, manuals, and linked notes alongside games; they use separate *want to play*, *playing*, and *beaten* views driven by note properties. Creating each note and choosing its cover still takes them roughly 30–60 seconds.[1] | Make adding a game quick, but leave a normal Markdown body for personal material. Keep status visible in Bases-compatible properties. |
| Several people deliberately keep only a wishlist text file or lightly formatted notes. One says elaborate organization made them stop using their notes.[2] | The first-run path should be useful with few fields and no required dashboard or setup project. |
| A backlog user wants help choosing the *next* game; after importing metadata, they still lack a good decision workflow. Others value offline access, local control, and links to the rest of their vault, while acknowledging that external trackers offer social context.[3] | Prioritize a usable backlog view and personal context over copying social ratings or exhaustive database fields. |
| A newcomer wants a ready-made way to track both games to buy and games to play.[4] | Treat ownership/purchase intent separately from play status; provide sensible defaults without making users design a schema first. |
| A user reports Game Search failing after its RAWG dependency stopped working, while Media DB could not retrieve non-Steam games in their setup; another commenter wants non-Steam coverage.[5] | Make provider failure legible, retain already-created notes, and allow manual entry when lookup fails. Do not assume Steam coverage is enough. |
| In a LOREBASE discussion, one user wants rating and status set during creation; another requests filtering by custom tags; another objects to hardcoded folders/statuses and fields being added, removed, or stored outside Markdown.[6] | Put the few common personal fields in the add flow; keep saved fields inspectable and preserve existing custom properties. Filter on stored properties where feasible. |
| A game-library user links game, company, developer, and musician notes. Commenters disagree on whether an extra library plugin is easier than Bases and ask for better cover sizing and usable genre filtering.[7] | Preserve Obsidian links and property types; test the visual result in a real library view. Avoid requiring another plugin for the core add-and-note flow. |
| An Android Media DB user says adding an already-present game silently overwrote their prior note and metadata despite an expected confirmation.[8] | Detect existing notes before any write on desktop and mobile; default to opening or skipping them, never replacing personal content silently. |
| A book-library author spent days collecting metadata and covers for over 100 titles, while another person prefers manually cross-checking sources and choosing art for accuracy.[9] | Automate the initial candidate, then let the user inspect the match and keep or change the cover and fields. Automation should not imply infallible metadata. |
| A Book Search user reports that a cover appears in the note body but a null property leaves the collection card blank.[10] | Use one consistent cover property for generated notes and library views; a missing image must degrade cleanly. |
| Book Search users want multiple creators represented as linkable values; one also reports editor/translator misclassification and omitted subtitles.[11] | Keep multivalue metadata structured and editable. Show enough identity detail to verify a selected game or edition before saving. |
| The Pretty Properties author built a compact cover beside metadata because a separate image consumed too much vertical space.[12] | Keep the note header compact; do not let decoration bury the user's writing. |
| Media DB issue #77 describes a game search that surfaced a movie API error even though a Steam result existed.[13] | Scope lookup and errors to the selected media type; show which source failed and whether usable results remain. |
| Media DB issue #263 reports a released plugin whose settings lacked non-Steam provider fields described elsewhere, leaving the user unable to add retro games.[14] | Ensure the shipped build and help text agree; verify non-Steam search in the actual installed release. |
| A Media DB user could not understand the documented CSV import path; a follow-up asks whether imported metadata survives enrichment.[15] | If import is added later, show a preview and explicit preservation rules. Avoid presenting bulk import as a one-click promise now. |
| A LOREBASE issue requests renaming the fixed `userRating` field.[16] | Avoid imposing an inflexible rating field on existing vault schemas; rating can remain optional in the initial scope. |
| A LOREBASE issue reports white text on white backgrounds in game search and filters under a light theme.[17] | Check the add/search flow in both light and dark themes, including hover and focus states. |

## Design choices and conflicts

1. **Minimum useful flow:** search or enter a title, inspect a candidate, choose a personal status (and optionally ownership), then create a readable Markdown note. Keep later edits in that note. This addresses setup cost and data ownership without requiring a separate library UI.[1][2][4]
2. **Search quality over silent automation:** show title, year, platform, and cover when available; make ambiguity and failures visible. A successful lookup must never overwrite an existing note or user-edited field.[5][8][13]
3. **Vault-native organization:** expose stable, editable properties and links so users can use Bases or their own lists. Support a small default status vocabulary, but do not assume one user's statuses, rating scale, or folder structure fit everyone.[1][6][16]
4. **Visuals with restraint:** covers matter to some users, but dense cards and oversized headers can displace notes. Keep a text-first path viable and verify cover rendering in the actual view.[2][10][12]
5. **Defer expansive scope:** Steam/Playnite sync, bulk import, social features, and elaborate analytics have individual advocates, but these posts do not show they are necessary for a first game-note plugin. Preserve data so such workflows remain possible later.[3][6][15]

The clearest conflict is between a rich, visual game catalog and an almost frictionless plain-text backlog.[1][2] A second is automatic metadata versus careful manual selection.[9] The evidence supports a quick default with an editable result, not a universal preference for either extreme. Online comments and issue reporters self-select; counts or votes here are not population estimates. Reports about other plugins identify failure modes, not proof that Game Shelf has those defects. This scan found no first-person reports about using Games Never Die as an Obsidian metadata source.

## Existing plugins inspected as references only

- [Game Search](https://github.com/Gubchik123/obsidian-game-search-plugin): search, select, and create a templated game note; useful flow reference.
- [Media DB](https://github.com/mProjectsCode/obsidian-media-db-plugin): cross-media metadata and configurable notes; its issues above expose search and preservation risks.
- [LOREBASE](https://github.com/Murchi1k/obsidian-lorebase-plugin): visual game/media library and import/sync scope; its user comments and issues above expose customization and theme concerns.
- [Game Backlog](https://github.com/jpyke3/obsidian-game-backlog): dashboard-focused alternative with IGDB/HowLongToBeat/SteamGridDB and a Dataview dependency; useful comparison for setup complexity.

## Sources

[1] https://www.reddit.com/r/ObsidianMD/comments/1nh3izx/bases_is_absolutely_awesome_for_tracking_games
[2] https://www.reddit.com/r/ObsidianMD/comments/1sshb5g/my_gaming_backlog_on_obsidian_no_bases_no_fancy
[3] https://www.reddit.com/r/ObsidianMD/comments/1nfftwd/gaming_backlog_using_bases_vs_another_method
[4] https://www.reddit.com/r/ObsidianMD/comments/1k2oeo5/are_there_any_templates_for_game_librariestracking
[5] https://www.reddit.com/r/ObsidianMD/comments/1vo2pv8/any_plugin_to_manage_adding_games
[6] https://www.reddit.com/r/ObsidianMD/comments/1tvmhr0/release_lorebase_v100
[7] https://www.reddit.com/r/ObsidianMD/comments/1wb5kna/working_on_a_personal_game_library_any_tips_for
[8] https://forum.obsidian.md/t/media-db-overwrites-file-when-you-create-it-again-instead-of-asking-if-it-should-overwrite-first/106034
[9] https://forum.obsidian.md/t/media-library-with-bases-pretty-properties/103522
[10] https://forum.obsidian.md/t/book-search-plugin-isnt-importing-some-covers/76727
[11] https://forum.obsidian.md/t/book-search-plugin-splitting-multiple-authors/47281
[12] https://forum.obsidian.md/t/pretty-properties/103681
[13] https://github.com/mProjectsCode/obsidian-media-db-plugin/issues/77
[14] https://github.com/mProjectsCode/obsidian-media-db-plugin/issues/263
[15] https://github.com/mProjectsCode/obsidian-media-db-plugin/issues/200
[16] https://github.com/Murchi1k/obsidian-lorebase-plugin/issues/29
[17] https://github.com/Murchi1k/obsidian-lorebase-plugin/issues/21
