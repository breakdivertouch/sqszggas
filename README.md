# Kogama Account Switcher

A Chrome (Manifest V3) extension for [Kogama](https://www.kogama.com/) that adds
two new entries to the profile dropdown menu:

* **Сменить аккаунт** (*Switch Account*) — opens an in-page modal listing your
  saved accounts (avatar, nickname, ID). Click an account to switch into it,
  remove it from the list, or add a new one by entering its username and
  password.
* **Тихий выход** (*Silent Logout*) — clears all `kogama.com` / `kgoma.com`
  cookies and reloads the page without calling the regular logout endpoint.

## How it works

* **Login & session capture** — when you add an account, the extension's
  service worker POSTs `{username, password}` to
  `https://www.kogama.com/auth/login/`. On success the site returns a `session`
  cookie that the extension reads back via `chrome.cookies.get`, then fetches
  `https://www.kogama.com/profile/me/` to discover the numeric account id and
  parse the username / avatar URL. The previously active `session` cookie is
  restored after the operation, so adding an account never logs you out of your
  current one.
* **Switch account** — replaces the `session` cookie with the saved one for
  the selected account and redirects to `/profile/me/`.
* **Silent logout** — removes every cookie scoped to `kogama.com` / `kgoma.com`
  and reloads the page. No server-side logout request is sent.
* **Storage** — saved accounts (id, username, avatar URL, session cookie
  value) live in `chrome.storage.local` on the user's machine only.

## Installation (developer mode)

1. Clone or download this repository.
2. Open `chrome://extensions` in Chrome.
3. Enable **Developer mode** (top right).
4. Click **Load unpacked** and select the project folder
   (`sqszggas/` — the folder that contains `manifest.json`).
5. Navigate to <https://www.kogama.com/>.
6. Open the user menu (avatar / three-dot menu). You should now see
   **Сменить аккаунт** at the top of the menu and **Тихий выход** at the
   bottom.

## Files

| File              | Purpose                                                        |
|-------------------|----------------------------------------------------------------|
| `manifest.json`   | Manifest V3 declaration (permissions + content script + worker)|
| `background.js`   | Service worker: cookie handling, login, storage CRUD           |
| `content.js`      | Injects menu items + renders the switcher modal                |
| `content.css`     | Modal / menu styles                                            |
| `icons/`          | Extension icons (16/32/48/128 px)                              |

## Security notes

The extension stores session cookies locally in `chrome.storage.local`. Anyone
with access to your Chrome profile can read them, exactly as they could read
the regular browser cookie jar. Use this extension only on machines you trust.

The extension never sends credentials anywhere except to the official
`https://www.kogama.com/auth/login/` endpoint, and never contacts a third-party
server.
