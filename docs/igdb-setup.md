# Set up English game data with IGDB

Game Shelf contacts IGDB directly using your own Twitch application. There is
no Game Shelf server or shared application key. Japanese game data still comes
from Games Never Die, and manual notes work offline without credentials.

The same guide is available inside the plugin in English and Japanese. Open
**Settings → Game Shelf → Set up IGDB credentials**, or the setup button shown
when you first search English data.

1. Sign in to [Twitch](https://www.twitch.tv/) and enable
   [two-factor authentication](https://www.twitch.tv/settings/security).
2. Open the [Twitch Developer Console](https://dev.twitch.tv/console/apps) and
   register an application. Choose a unique name and an appropriate category.
3. Set the OAuth Redirect URL to `http://localhost` and Client Type to
   **Confidential**. IGDB does not use the redirect URL, but Twitch requires it.
4. Manage the application and generate a **New Secret**. Enter the **Client ID**
   in Game Shelf. This ID is public; do not paste the Client Secret there.
5. In Game Shelf's **IGDB Client Secret** control, create a secret in Obsidian
   SecretStorage, paste the Client Secret as its value, and select its reference.
   Settings save the reference, not the secret value.
6. Enable **Online search**, then select **Test IGDB connection**. If it fails,
   check the ID, secret selection and network. Regenerating the Twitch secret
   invalidates the old value; update SecretStorage before testing again.
7. Set **New-note language** to **English** and **Game data source** to
   **Automatic by note language** or **IGDB (English)**. The interface can stay
   Japanese. Open **Find a game**, search, inspect the preview, and create a note.

IGDB may lack an English name or overview for an individual game. Game Shelf
retains source text and missing fields instead of inventing a translation.
Headings, media labels and play-log units use the chosen note language. Source
articles and Steam price/player statistics are GND-only features.

Credentials are sent only to Twitch for an application token; that token is sent
to IGDB. No note text, ratings, journal, or vault paths are sent. Tokens remain
in memory. SecretStorage belongs to the vault and does not guarantee encrypted
storage. Its value may need to be configured separately on each synced device.
Do not publish credentials or include them in screenshots, issues, or notes.

Changing your default language or source does not rewrite old notes. Existing
GND notes still refresh from GND; IGDB notes refresh by their numeric IGDB ID.
No automatic cross-source merging or bulk note translation is performed.

Registration and provider terms remain controlled by Twitch/IGDB. See the
[official IGDB setup guide](https://api-docs.igdb.com/#getting-started),
[Twitch application guide](https://dev.twitch.tv/docs/authentication/register-app/),
and [Obsidian SecretStorage guide](https://docs.obsidian.md/plugins/guides/secret-storage).
