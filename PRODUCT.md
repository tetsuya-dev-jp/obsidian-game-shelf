# Product

<!-- impeccable:product-schema 1 -->

## Platform
web

## Stack
TypeScript and native Obsidian UI, bundled with esbuild. No server, Python runtime, React, account, API key, or runtime package installation.

## Users
Obsidian users who give equal importance to writing and revisiting game notes, and managing a backlog and play status. Japanese and English UI. Keyboard and touch users.

## Product Purpose
Turn an identified game into a useful, personal Markdown note, then help users choose what to play and revisit what they thought. Success is a short search-to-note path and a useful offline library, without deleting personal writing.

## Operating Context
Runs inside the user's existing vault and theme, including narrow panes. Uses the existing Games Never Die client contract, ported to browser-safe TypeScript. Online lookups are user initiated; writing, library browsing and play logs work offline. The user's personal vault is not a test environment.

## Capabilities and Constraints
Search, edition-aware selection, metadata selection, preview, local covers, duplicate detection, ordinary Markdown notes, local library filters, personal status/rating, dated play sessions, conflict-aware metadata refresh, custom templates and property mappings. No bulk crawling or account sync. Upstream facts are attributed and not independently guaranteed. Official community-directory acceptance is external to this project.

## Evidence on Hand
Existing verified Python source at ../gamesneverdie-client. Primary user-opinion findings will be recorded in docs/user-research.md. Official plugin requirements and verification evidence belong in docs/. No invented adoption, testimonials, or superiority benchmarks.

## Product Principles
- Personal writing is owned by the user and survives metadata refresh and plugin removal.
- A game and its editions are distinct; an existing note is opened rather than silently duplicated.
- Useful immediately without configuration, adaptable without another required plugin.
- Reveal optional metadata and spoilers deliberately.
- Collection management and reflection have equal weight, confirmed by the user.

## Accessibility & Inclusion
Native theme variables and Obsidian controls, visible keyboard focus, semantic labels and live status, reduced-motion support, reflow in narrow panes, and no color-only status indicators. Desktop behavior is verified in real Obsidian; mobile claims require separate evidence.
