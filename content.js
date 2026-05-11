// Kogama Account Switcher — content script
//
// Watches the Kogama page for the profile dropdown opening, then injects
// two extra menu entries:
//   * "Сменить аккаунт" — opens an in-page modal with saved accounts.
//   * "Тихий выход" — clears all cookies and reloads the page.

(() => {
  const MENU_ANCHOR_TEXTS = ["Обновить профиль", "Update Profile"];
  const LOGOUT_TEXTS = ["Выйти", "Logout", "Log out", "Sign Out"];
  const INJECT_MARKER = "data-kas-injected";

  const SWITCH_LABEL = "Сменить аккаунт";
  const SILENT_LOGOUT_LABEL = "Тихий выход";

  const messageBackground = (payload) =>
    new Promise((resolve, reject) => {
      try {
        chrome.runtime.sendMessage(payload, (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          if (!response) {
            reject(new Error("No response from extension service worker."));
            return;
          }
          if (!response.ok) {
            reject(new Error(response.error || "Unknown error."));
            return;
          }
          resolve(response);
        });
      } catch (err) {
        reject(err);
      }
    });

  function findMenuRoot() {
    // The Kogama profile dropdown contains the "Обновить профиль" entry. We
    // walk up from that node to the nearest container that also holds the
    // logout button, so we know we're operating on the popover and not the
    // surrounding page.
    const anchors = [];
    for (const text of MENU_ANCHOR_TEXTS) {
      const xpath = document.evaluate(
        `//*[normalize-space(text())="${text}"]`,
        document,
        null,
        XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
        null
      );
      for (let i = 0; i < xpath.snapshotLength; i += 1) {
        anchors.push(xpath.snapshotItem(i));
      }
    }
    for (const anchor of anchors) {
      let node = anchor;
      while (node && node !== document.body) {
        if (containsLogoutText(node)) {
          return { container: node, profileAnchor: anchor };
        }
        node = node.parentElement;
      }
    }
    return null;
  }

  function containsLogoutText(node) {
    if (!node || !node.textContent) return false;
    const text = node.textContent;
    return LOGOUT_TEXTS.some((label) =>
      new RegExp(`(^|[^\\p{L}])${escapeRegExp(label)}([^\\p{L}]|$)`, "u").test(
        text
      )
    );
  }

  function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function findLogoutClickable(container) {
    const candidates = container.querySelectorAll(
      "a, button, [role='button'], [role='menuitem'], div, span"
    );
    for (const el of candidates) {
      const text = (el.textContent || "").trim();
      if (!text) continue;
      if (LOGOUT_TEXTS.some((label) => text === label)) {
        return el.closest("a, button, [role='menuitem'], [role='button']") || el;
      }
    }
    return null;
  }

  function findClickableForAnchor(anchor) {
    return (
      anchor.closest(
        "a, button, [role='menuitem'], [role='button']"
      ) || anchor
    );
  }

  function buildMenuItem({ label, icon, onClick, modifier }) {
    const item = document.createElement("button");
    item.type = "button";
    item.className = `kas-menu-item${modifier ? ` kas-menu-item--${modifier}` : ""}`;
    item.setAttribute("role", "menuitem");
    item.innerHTML = `
      <span class="kas-menu-item__icon" aria-hidden="true">${icon}</span>
      <span class="kas-menu-item__label"></span>
    `;
    item.querySelector(".kas-menu-item__label").textContent = label;
    item.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      onClick(event);
    });
    return item;
  }

  function injectMenuItems(menuInfo) {
    const { container, profileAnchor } = menuInfo;
    if (container.getAttribute(INJECT_MARKER) === "1") return;
    container.setAttribute(INJECT_MARKER, "1");

    const profileItem = findClickableForAnchor(profileAnchor);
    const logoutItem = findLogoutClickable(container);

    const switchButton = buildMenuItem({
      label: SWITCH_LABEL,
      modifier: "switch",
      icon:
        '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 3h5v5"/><path d="M21 3l-7 7"/><path d="M8 21H3v-5"/><path d="M3 21l7-7"/></svg>',
      onClick: () => {
        closeKogamaMenu();
        openSwitcherModal();
      },
    });

    const silentLogoutButton = buildMenuItem({
      label: SILENT_LOGOUT_LABEL,
      modifier: "silent",
      icon:
        '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/><path d="M12 19a7 7 0 1 1 0-14"/></svg>',
      onClick: async () => {
        closeKogamaMenu();
        try {
          await messageBackground({ type: "kas:silent-logout" });
          showToast("Cookies очищены. Перезагрузка…");
          setTimeout(() => window.location.reload(), 400);
        } catch (err) {
          showToast(`Ошибка тихого выхода: ${err.message}`, "error");
        }
      },
    });

    if (profileItem && profileItem.parentElement) {
      profileItem.parentElement.insertBefore(switchButton, profileItem);
    } else {
      container.appendChild(switchButton);
    }
    if (logoutItem && logoutItem.parentElement) {
      logoutItem.parentElement.insertBefore(
        silentLogoutButton,
        logoutItem.nextSibling
      );
    } else {
      container.appendChild(silentLogoutButton);
    }
  }

  function closeKogamaMenu() {
    // Click somewhere safe to dismiss the native popover so it doesn't
    // overlap with our modal.
    document.body.click();
  }

  // ---------------- Modal ----------------

  let modalRoot = null;

  function ensureModalRoot() {
    if (modalRoot) return modalRoot;
    modalRoot = document.createElement("div");
    modalRoot.id = "kas-modal-root";
    modalRoot.innerHTML = `
      <div class="kas-backdrop" data-kas-close="1"></div>
      <div class="kas-dialog" role="dialog" aria-modal="true" aria-labelledby="kas-title">
        <header class="kas-dialog__header">
          <h2 id="kas-title">Сменить аккаунт</h2>
          <button class="kas-icon-button" type="button" data-kas-close="1" aria-label="Закрыть">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18"/><path d="M6 6l12 12"/></svg>
          </button>
        </header>
        <div class="kas-dialog__body">
          <div class="kas-account-list" data-kas-list></div>
          <div class="kas-empty" data-kas-empty hidden>
            Сохранённых аккаунтов пока нет. Нажмите «Добавить аккаунт», чтобы добавить первый.
          </div>
          <button class="kas-primary kas-add-toggle" type="button" data-kas-toggle-add>
            <span class="kas-plus">+</span> Добавить аккаунт
          </button>
          <form class="kas-add-form" data-kas-form hidden autocomplete="off">
            <label class="kas-field">
              <span>Логин</span>
              <input type="text" name="username" required autocomplete="username" />
            </label>
            <label class="kas-field">
              <span>Пароль</span>
              <input type="password" name="password" required autocomplete="current-password" />
            </label>
            <div class="kas-form-error" data-kas-form-error hidden></div>
            <div class="kas-form-actions">
              <button type="button" class="kas-secondary" data-kas-cancel-add>Отмена</button>
              <button type="submit" class="kas-primary" data-kas-submit>Войти и сохранить</button>
            </div>
          </form>
        </div>
      </div>
    `;
    document.documentElement.appendChild(modalRoot);

    modalRoot.addEventListener("click", (event) => {
      const target = event.target;
      if (target instanceof Element && target.closest("[data-kas-close]")) {
        hideModal();
      }
    });

    const form = modalRoot.querySelector("[data-kas-form]");
    const toggleAddButton = modalRoot.querySelector("[data-kas-toggle-add]");
    const cancelAddButton = modalRoot.querySelector("[data-kas-cancel-add]");
    toggleAddButton.addEventListener("click", () => {
      setAddFormVisible(true);
    });
    cancelAddButton.addEventListener("click", () => {
      setAddFormVisible(false);
    });
    form.addEventListener("submit", handleAddSubmit);

    document.addEventListener("keydown", (event) => {
      if (modalRoot && !modalRoot.hidden && event.key === "Escape") {
        hideModal();
      }
    });

    return modalRoot;
  }

  function setAddFormVisible(visible) {
    const form = modalRoot.querySelector("[data-kas-form]");
    const toggle = modalRoot.querySelector("[data-kas-toggle-add]");
    form.hidden = !visible;
    toggle.hidden = !!visible;
    if (visible) {
      const errorEl = form.querySelector("[data-kas-form-error]");
      errorEl.hidden = true;
      errorEl.textContent = "";
      const usernameInput = form.querySelector("input[name='username']");
      usernameInput.focus();
    } else {
      form.reset();
    }
  }

  function showModal() {
    ensureModalRoot();
    modalRoot.hidden = false;
    document.documentElement.classList.add("kas-modal-open");
    refreshAccountList();
    setAddFormVisible(false);
  }

  function hideModal() {
    if (!modalRoot) return;
    modalRoot.hidden = true;
    document.documentElement.classList.remove("kas-modal-open");
  }

  function openSwitcherModal() {
    showModal();
  }

  async function handleAddSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const submitButton = form.querySelector("[data-kas-submit]");
    const errorEl = form.querySelector("[data-kas-form-error]");
    const usernameInput = form.querySelector("input[name='username']");
    const passwordInput = form.querySelector("input[name='password']");
    const username = usernameInput.value.trim();
    const password = passwordInput.value;
    if (!username || !password) {
      errorEl.textContent = "Заполните логин и пароль.";
      errorEl.hidden = false;
      return;
    }
    errorEl.hidden = true;
    errorEl.textContent = "";
    submitButton.disabled = true;
    submitButton.textContent = "Вход…";
    try {
      const response = await messageBackground({
        type: "kas:add-account",
        payload: { username, password },
      });
      renderAccounts(response.accounts);
      setAddFormVisible(false);
      showToast(`Аккаунт ${response.account.username} сохранён.`);
    } catch (err) {
      errorEl.textContent = err.message || "Не удалось войти.";
      errorEl.hidden = false;
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = "Войти и сохранить";
    }
  }

  async function refreshAccountList() {
    const listEl = modalRoot.querySelector("[data-kas-list]");
    listEl.innerHTML = '<div class="kas-loading">Загрузка…</div>';
    try {
      const response = await messageBackground({ type: "kas:list-accounts" });
      renderAccounts(response.accounts);
    } catch (err) {
      listEl.innerHTML = "";
      showToast(`Ошибка загрузки: ${err.message}`, "error");
    }
  }

  function renderAccounts(accounts) {
    const listEl = modalRoot.querySelector("[data-kas-list]");
    const emptyEl = modalRoot.querySelector("[data-kas-empty]");
    listEl.innerHTML = "";
    if (!accounts || accounts.length === 0) {
      emptyEl.hidden = false;
      return;
    }
    emptyEl.hidden = true;
    for (const account of accounts) {
      listEl.appendChild(buildAccountCard(account));
    }
  }

  function buildAccountCard(account) {
    const card = document.createElement("div");
    card.className = "kas-account-card";
    card.dataset.kasAccountId = account.id;

    const avatar = document.createElement("div");
    avatar.className = "kas-avatar";
    if (account.avatarUrl) {
      const img = document.createElement("img");
      img.src = account.avatarUrl;
      img.alt = "";
      img.referrerPolicy = "no-referrer";
      img.addEventListener("error", () => {
        avatar.classList.add("kas-avatar--fallback");
        avatar.textContent = (account.username || "?").slice(0, 1).toUpperCase();
      });
      avatar.appendChild(img);
    } else {
      avatar.classList.add("kas-avatar--fallback");
      avatar.textContent = (account.username || "?").slice(0, 1).toUpperCase();
    }

    const text = document.createElement("div");
    text.className = "kas-account-card__text";
    const nameEl = document.createElement("div");
    nameEl.className = "kas-account-card__name";
    nameEl.textContent = account.username || `Account ${account.id}`;
    const idEl = document.createElement("div");
    idEl.className = "kas-account-card__id";
    idEl.textContent = `ID: ${account.id}`;
    text.appendChild(nameEl);
    text.appendChild(idEl);

    const switchBtn = document.createElement("button");
    switchBtn.type = "button";
    switchBtn.className = "kas-primary kas-account-card__switch";
    switchBtn.textContent = "Войти";
    switchBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      handleSwitch(account, switchBtn);
    });

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "kas-ghost kas-account-card__remove";
    removeBtn.title = "Убрать аккаунт из списка";
    removeBtn.textContent = "Выйти";
    removeBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      handleDelete(account);
    });

    card.appendChild(avatar);
    card.appendChild(text);
    card.appendChild(switchBtn);
    card.appendChild(removeBtn);

    card.addEventListener("click", () => handleSwitch(account, switchBtn));
    return card;
  }

  async function handleSwitch(account, button) {
    const originalText = button.textContent;
    button.disabled = true;
    button.textContent = "Переключение…";
    try {
      await messageBackground({
        type: "kas:switch-account",
        payload: { id: account.id },
      });
      showToast(`Вход в ${account.username}…`);
      window.location.href = "/profile/me/";
    } catch (err) {
      showToast(`Не удалось переключить: ${err.message}`, "error");
      button.disabled = false;
      button.textContent = originalText;
    }
  }

  async function handleDelete(account) {
    try {
      const response = await messageBackground({
        type: "kas:delete-account",
        payload: { id: account.id },
      });
      renderAccounts(response.accounts);
      showToast(`Аккаунт ${account.username} удалён из списка.`);
    } catch (err) {
      showToast(`Не удалось удалить: ${err.message}`, "error");
    }
  }

  // ---------------- Toast ----------------
  let toastTimer = null;
  function showToast(message, kind = "info") {
    let toast = document.getElementById("kas-toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "kas-toast";
      document.documentElement.appendChild(toast);
    }
    toast.textContent = message;
    toast.dataset.kind = kind;
    toast.classList.add("kas-toast--visible");
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.classList.remove("kas-toast--visible");
    }, 3500);
  }

  // ---------------- Observer ----------------
  const observer = new MutationObserver(() => {
    const menuInfo = findMenuRoot();
    if (menuInfo) injectMenuItems(menuInfo);
  });
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });

  // Initial pass in case the menu is already open on load.
  const initial = findMenuRoot();
  if (initial) injectMenuItems(initial);
})();
