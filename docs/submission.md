# Community-directory submission

Checked against the official documentation on 2026-11-13. This checklist is
preparation for submission, not a claim of approval.

The [1.0.0 release](https://github.com/tetsuya-dev-jp/obsidian-game-shelf/releases/tag/1.0.0)
is public. All three installable assets were downloaded and compared directly
with the files tested locally; they are identical. The source commit passed
Linux, macOS and Windows CI. See [release verification](release-verification.json).

The owner submitted the draft for automated review on 2026-11-16. The
[1.0.1 release](https://github.com/tetsuya-dev-jp/obsidian-game-shelf/releases/tag/1.0.1)
addresses its source/CSS warnings and is now public. Its source passed Linux,
macOS and Windows CI. All three downloaded assets match the tested local files,
and their attestations verify against the release workflow, source commit and
`1.0.1` tag. See [release verification](release-verification-1.0.1.json) and
[review responses](official-review.md). The supplied 1.0.1 rescan confirms the
attestation, dependency and reproducible-build passes; its DOM-helper warning
still remains in that review. The published
[1.0.2 release](https://github.com/tetsuya-dev-jp/obsidian-game-shelf/releases/tag/1.0.2)
removes wrapper construction and adds a local regression gate. Its source
passed three-OS CI, and all three downloaded files match the tested local
assets and have verified attestations; see
[1.0.2 release verification](release-verification-1.0.2.json).
The latest observed entry was a draft; a new directory verdict has not been
observed and community approval is not claimed.

## 1.1.0 release candidate

The bilingual candidate adds user-owned IGDB credentials without a plugin
server. Accounts, destinations and SecretStorage limitations are disclosed in
README and the in-app English/Japanese setup guide. The independent static
[policy/API review](review-1.1.0-policy.md) and
[correctness/security review](review-1.1.0-security.md) passed after corrections.
Native fixture scenarios passed on Obsidian 1.13.7 and 1.15.1; see
[verification](verification.md). Authenticated live IGDB and native mobile
execution have not been tested. The candidate is not yet published, and no
new official Community-directory verdict is claimed.

## Current route

The current route is the [Obsidian Community directory](https://community.obsidian.md),
not a pull request against the old community-plugins JSON list. The
[submission guide](https://docs.obsidian.md/Plugins/Releasing/Submit%20your%20plugin)
requires a public source repository, root README/LICENSE/manifest, and a GitHub
release with a tag identical to the manifest version. The downloadable assets
are `main.js`, `manifest.json` and `styles.css`.

1. Sign in using the owner's Obsidian account.
2. Connect the owner's GitHub account with the directory's read-only ownership
   check, as described in [Set up and claim](https://docs.obsidian.md/community-directory/set-up-and-claim).
3. Choose **Plugins → New plugin** and supply
   `https://github.com/tetsuya-dev-jp/obsidian-game-shelf`.
4. Review the [developer policies](https://docs.obsidian.md/community-directory/developer-policies)
   and maintenance commitment personally before submitting.
5. Review the automated scanner results. Fix any errors, increment the version,
   publish the matching release, then publish when the directory allows it.

Account authentication, the maintenance agreement and the directory's review
are external steps. Do not describe the plugin as community-approved until the
live directory entry confirms that state. No account was created or agreement
accepted on the owner's behalf as part of preparing the source.

## Local gates

- Unique ID/name checked against the current registry before choosing `game-shelf`.
- English, descriptive name and a short description ending with a period.
- Manifest/package/versions compatibility map agree; release tag has no `v` prefix.
- Official `eslint-plugin-obsidianmd` recommended rules run over the whole root,
  including package, manifest and license.
- Network destinations, purpose, storage, licensing and third-party notices are
  disclosed in README.
- No Node/Electron APIs in shipped code, global app access, remote script
  evaluation, telemetry, self-updating or hardcoded vault configuration path.
- UI uses native components/theme variables, registered component lifecycles,
  searchable settings and no default hotkeys.
- Release files are built from the reviewed source; the published assets must
  be downloaded and compared directly before delivery.

See [submission requirements](https://docs.obsidian.md/community-directory/submission-requirements-for-plugins),
[manifest reference](https://docs.obsidian.md/Reference/Manifest), and
[official lint rules](https://github.com/obsidianmd/eslint-plugin).
