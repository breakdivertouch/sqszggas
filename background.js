// Kogama Account Switcher — service worker
//
// Responsibilities:
//   * Handle programmatic login (POST /auth/login/) and capture the
//     resulting `session` cookie from the kogama.com cookie jar.
//   * Read / write / remove the `session` cookie when switching or
//     silently logging out.
//   * Manage the saved accounts list in chrome.storage.local.

const KOGAMA_ORIGIN = "https://www.kogama.com";
const LOGIN_URL = `${KOGAMA_ORIGIN}/auth/login/`;
const PROFILE_ME_URL = `${KOGAMA_ORIGIN}/profile/me/`;
const SESSION_COOKIE_NAME = "session";
const STORAGE_KEY = "kogama_accounts_v1";

function getCookie(name, url = KOGAMA_ORIGIN) {
  return new Promise((resolve) => {
    chrome.cookies.get({ url, name }, (cookie) => resolve(cookie || null));
  });
}

function getAllCookiesForDomains() {
  const domains = ["kogama.com", "kgoma.com"];
  return Promise.all(
    domains.map(
      (domain) =>
        new Promise((resolve) => {
          chrome.cookies.getAll({ domain }, (cookies) => resolve(cookies || []));
        })
    )
  ).then((arrays) => arrays.flat());
}

function setSessionCookie(value) {
  return new Promise((resolve, reject) => {
    if (!value) {
      resolve(null);
      return;
    }
    const expirationDate = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30;
    chrome.cookies.set(
      {
        url: KOGAMA_ORIGIN,
        name: SESSION_COOKIE_NAME,
        value,
        domain: ".kogama.com",
        path: "/",
        secure: true,
        httpOnly: false,
        sameSite: "lax",
        expirationDate,
      },
      (cookie) => {
        if (chrome.runtime.lastError || !cookie) {
          reject(
            new Error(
              (chrome.runtime.lastError && chrome.runtime.lastError.message) ||
                "Failed to set session cookie"
            )
          );
        } else {
          resolve(cookie);
        }
      }
    );
  });
}

function removeCookie(cookie) {
  return new Promise((resolve) => {
    const scheme = cookie.secure ? "https://" : "http://";
    const host = cookie.domain.startsWith(".")
      ? cookie.domain.slice(1)
      : cookie.domain;
    const url = `${scheme}${host}${cookie.path}`;
    chrome.cookies.remove(
      { url, name: cookie.name, storeId: cookie.storeId },
      () => resolve()
    );
  });
}

async function removeSessionCookie() {
  const cookies = await getAllCookiesForDomains();
  await Promise.all(
    cookies
      .filter((c) => c.name === SESSION_COOKIE_NAME)
      .map((c) => removeCookie(c))
  );
}

async function clearAllKogamaCookies() {
  const cookies = await getAllCookiesForDomains();
  await Promise.all(cookies.map((c) => removeCookie(c)));
}

async function readAccounts() {
  return new Promise((resolve) => {
    chrome.storage.local.get([STORAGE_KEY], (data) => {
      const list = data[STORAGE_KEY];
      resolve(Array.isArray(list) ? list : []);
    });
  });
}

async function writeAccounts(accounts) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [STORAGE_KEY]: accounts }, () => resolve());
  });
}

async function upsertAccount(account) {
  const accounts = await readAccounts();
  const filtered = accounts.filter((a) => String(a.id) !== String(account.id));
  filtered.unshift({ ...account, savedAt: Date.now() });
  await writeAccounts(filtered);
  return filtered;
}

async function deleteAccount(id) {
  const accounts = await readAccounts();
  const filtered = accounts.filter((a) => String(a.id) !== String(id));
  await writeAccounts(filtered);
  return filtered;
}

async function fetchProfileInfoFromCurrentSession() {
  const meResponse = await fetch(PROFILE_ME_URL, {
    method: "GET",
    credentials: "include",
    redirect: "follow",
  });
  if (!meResponse.ok) {
    throw new Error(
      `Failed to load profile (status ${meResponse.status}). Login may have failed.`
    );
  }
  const finalUrl = meResponse.url || "";
  const idMatch = finalUrl.match(/\/profile\/(\d+)\//);
  if (!idMatch) {
    throw new Error(
      "Could not determine account id from profile redirect."
    );
  }
  const accountId = idMatch[1];
  const html = await meResponse.text();
  const usernameMatch =
    html.match(
      new RegExp(
        `href="/profile/${accountId}/username/"[^>]*>([^<]+)<`,
        "i"
      )
    ) ||
    html.match(
      /<title>\s*([^|<]+?)(?:\s*[\|–-]\s*KoGaMa)?\s*<\/title>/i
    );
  const username = usernameMatch ? usernameMatch[1].trim() : `User ${accountId}`;
  const avatarMatch =
    html.match(/xlink:href="(https?:[^"]+\.(?:png|jpg|jpeg|webp))"/i) ||
    html.match(/<image[^>]+href="(https?:[^"]+\.(?:png|jpg|jpeg|webp))"/i);
  const avatarUrl = avatarMatch ? avatarMatch[1] : "";
  return { id: accountId, username, avatarUrl };
}

async function loginAndCapture(username, password) {
  if (!username || !password) {
    throw new Error("Username and password are required.");
  }
  const previousSession = await getCookie(SESSION_COOKIE_NAME);
  await removeSessionCookie();
  try {
    const response = await fetch(LOGIN_URL, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ username, password }),
    });
    if (!response.ok) {
      let message = `Login failed (HTTP ${response.status}).`;
      try {
        const data = await response.json();
        if (data && data.error) {
          const errors = [];
          for (const key of Object.keys(data.error)) {
            const value = data.error[key];
            if (Array.isArray(value)) errors.push(...value);
            else errors.push(String(value));
          }
          if (errors.length) message = errors.join(" ");
        } else if (data && data.notifications) {
          const msgs = data.notifications
            .flatMap((n) => (Array.isArray(n.message) ? n.message : [n.message]))
            .filter(Boolean);
          if (msgs.length) message = msgs.join(" ");
        }
      } catch (_) {
        /* response body was not JSON */
      }
      throw new Error(message);
    }
    const newSessionCookie = await getCookie(SESSION_COOKIE_NAME);
    if (!newSessionCookie || !newSessionCookie.value) {
      throw new Error(
        "Login did not return a session cookie. Try again or login on the website first."
      );
    }
    const sessionValue = newSessionCookie.value;
    const profile = await fetchProfileInfoFromCurrentSession();
    const account = {
      id: profile.id,
      username: profile.username,
      avatarUrl: profile.avatarUrl,
      session: sessionValue,
    };
    const accounts = await upsertAccount(account);
    return { account, accounts };
  } finally {
    if (previousSession && previousSession.value) {
      try {
        await setSessionCookie(previousSession.value);
      } catch (_) {
        /* best effort restore */
      }
    }
  }
}

async function switchToAccount(id) {
  const accounts = await readAccounts();
  const account = accounts.find((a) => String(a.id) === String(id));
  if (!account) throw new Error("Account not found in saved list.");
  await removeSessionCookie();
  await setSessionCookie(account.session);
  return account;
}

async function silentLogout() {
  await clearAllKogamaCookies();
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    try {
      switch (message && message.type) {
        case "kas:list-accounts": {
          const accounts = await readAccounts();
          sendResponse({ ok: true, accounts });
          return;
        }
        case "kas:add-account": {
          const { username, password } = message.payload || {};
          const result = await loginAndCapture(username, password);
          sendResponse({ ok: true, ...result });
          return;
        }
        case "kas:delete-account": {
          const accounts = await deleteAccount(message.payload.id);
          sendResponse({ ok: true, accounts });
          return;
        }
        case "kas:switch-account": {
          const account = await switchToAccount(message.payload.id);
          sendResponse({ ok: true, account });
          return;
        }
        case "kas:silent-logout": {
          await silentLogout();
          sendResponse({ ok: true });
          return;
        }
        default:
          sendResponse({ ok: false, error: "Unknown message type." });
      }
    } catch (err) {
      sendResponse({ ok: false, error: err.message || String(err) });
    }
  })();
  return true;
});
