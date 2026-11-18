# Game Shelf design

## Direction

An Obsidian-native working library. The game covers provide personality; the interface stays quiet and gives equal room to choosing a game and writing about it. Preserve the host theme, system font and familiar controls. No new display font, gradients, decorative animation, or full-window takeover.

## Surfaces

- Library: a readable page title, one add action, local search, status filters with counts, genre/platform filters, and a responsive cover grid with a compact list alternative. Cards contain real covers, title, status and personal rating. Empty and no-match states give a useful next action.
- Discover: a search form on a left rail and a preview on the right. Title, date and platform distinguish editions before creation. The preview gives field selection, play status, rating, local-cover choice and a plain Markdown preview. On narrow panes the preview follows results with an explicit back action.
- Note details: the user's Markdown is primary. Status, ownership, personal score, started/finished dates and session logging are secondary actions next to the open-note action. Source refresh always shows a preview and protects personal fields and body text.
- Settings: use native searchable settings definitions. Folder, filename and template have working defaults; schema customization is advanced and validated before saving.

## Tokens

| Responsibility          | Token                                                                                                 |
| ----------------------- | ----------------------------------------------------------------------------------------------------- |
| Page / inset surface    | `--background-primary` / `--background-secondary`                                                     |
| Text / secondary text   | `--text-normal` / `--text-muted`                                                                      |
| Interactive emphasis    | `--interactive-accent` / `--text-on-accent`                                                           |
| Borders / hover / focus | `--background-modifier-border` / `--background-modifier-hover` / `--background-modifier-border-focus` |
| Typography              | `--font-interface`, 13px body, 12px metadata, 22px page heading                                       |
| Spacing                 | 4, 8, 12, 16, 24, 32px                                                                                |
| Radius                  | host `--radius-s`, `--radius-m`, `--radius-l`                                                         |
| Covers                  | 3:4 aspect ratio, object-fit cover, gamepad icon fallback                                              |
| Layout                  | 16–24px pane padding; grid min 128–142px; search rail 300px; single pane at 960px and below             |

## Interaction contract

Search is submitted explicitly to avoid needless requests. Enter submits, arrow keys move result focus, Escape returns from detail where appropriate. Source failures offer retry and manual creation without losing the query. No automatic network on startup. State survives switching between library and discovery during a session. No silent overwrites, remote HTML insertion, or default hotkeys.

The native view-content element is the only vertical scroller. The header stays visible with sticky positioning; focused inputs are revealed after keyboard and viewport changes. When the header leaves too little input space, it scrolls normally until focus leaves or space returns. The create action always follows the form in normal document flow so it cannot cover earlier fields. Narrow detail forms use one column; touch controls are at least 44px tall, with inputs at least 16px to avoid focus zoom on iOS. Mobile padding reserves Obsidian's floating navigation and safe area. Missing covers use a gamepad icon; titles remain in the adjacent text.

## Verification contract

Real Obsidian desktop at 1440x1000, dark/light themes, 390px narrow pane, keyboard activation of create, loading/error/empty/duplicate states, actual metadata cache and image decode, and saved-note content after refresh and logging. Mobile compatibility requires browser-safe code and responsive layout; native iOS/Android execution and touch behavior remain unverified.
