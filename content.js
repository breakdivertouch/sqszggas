// Kogama Account Switcher — content script
//
// Watches the Kogama page for the profile drawer opening, then injects
// two extra entries:
//   * "Сменить аккаунт" — opens an in-page modal with saved accounts.
//   * "Тихий выход" — clears all cookies and reloads the page.
//
// The Kogama profile menu is a MUI Drawer that is mounted to the body
// whenever the menu opens. Its content has this structure (class names
// reflect the current Kogama build):
//
//   div._38CK4                  // drawer content
//     div._1sKv_                // header (avatar / name / xp / gold)
//     div._2D2wg                // nav wrapper
//       hr.MuiDivider-root
//       ul (Обновить профиль, Друзья, Заблокированные пользователи)
//       hr.MuiDivider-root
//       ul (Buy Gold, Обновиться до Elite)
//       hr.MuiDivider-root
//       div._18Ml_              // footer links
//     div._1gJbZ                // logout wrapper
//       button#logout-link-handle  // "Выйти"
//
// We anchor everything off `#logout-link-handle` because the id is the
// most stable selector across builds.

(() => {
  const INJECT_MARKER = "data-kas-injected";

  const SWITCH_LABEL = "Сменить аккаунт";
  const SILENT_LOGOUT_LABEL = "Тихий выход";
  const SWITCH_MARKER = "data-kas-switch-item";
  const SILENT_MARKER = "data-kas-silent-button";

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

  // ---------------- Menu injection ----------------

  function findDrawerContent() {
    const logoutButton = document.getElementById("logout-link-handle");
    if (!logoutButton) return null;
    const logoutWrap = logoutButton.parentElement; // div._1gJbZ
    if (!logoutWrap) return null;
    const drawerContent = logoutWrap.parentElement; // div._38CK4
    if (!drawerContent) return null;

    let navWrap = null;
    for (const child of drawerContent.children) {
      if (child !== logoutWrap && child.querySelector("ul")) {
        navWrap = child;
        break;
      }
    }
    if (!navWrap) return null;
    return { drawerContent, navWrap, logoutWrap, logoutButton };
  }

  function buildSwitchItem(templateLi) {
    const li = templateLi.cloneNode(true);
    li.setAttribute(SWITCH_MARKER, "1");

    // Strip any existing href / click handlers from cloned <a>/<button>.
    const clickable = li.querySelector("a, button");
    if (clickable) {
      // Replace with a fresh <button> so React can't reattach old handlers.
      const replacement = document.createElement("button");
      replacement.type = "button";
      replacement.className = clickable.className;
      replacement.textContent = SWITCH_LABEL;
      clickable.parentNode.replaceChild(replacement, clickable);
    } else {
      const textContainer = li.querySelector(".MuiListItemText-primary, span");
      if (textContainer) textContainer.textContent = SWITCH_LABEL;
    }

    // Swap the icon to a "switch arrows" SVG.
    const iconHost = li.querySelector(".MuiListItemIcon-root");
    if (iconHost) {
      iconHost.innerHTML =
        '<svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 512 512" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg"><path d="M280 168c0-13.3 10.7-24 24-24h132.1l-30.1-30.1c-9.4-9.4-9.4-24.6 0-33.9 9.4-9.4 24.6-9.4 33.9 0l71 71c9.4 9.4 9.4 24.6 0 33.9l-71 71c-9.4 9.4-24.6 9.4-33.9 0s-9.4-24.6 0-33.9L436.1 192H304c-13.3 0-24-10.7-24-24zM232 344c0 13.3-10.7 24-24 24H75.9l30.1 30.1c9.4 9.4 9.4 24.6 0 33.9-9.4 9.4-24.6 9.4-33.9 0l-71-71c-9.4-9.4-9.4-24.6 0-33.9l71-71c9.4-9.4 24.6-9.4 33.9 0s9.4 24.6 0 33.9L75.9 320H208c13.3 0 24 10.7 24 24z"/></svg>';
    }

    li.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      closeKogamaDrawer();
      openSwitcherModal();
    });

    // Also bind on the inner button so keyboard activation works.
    const button = li.querySelector("button, a");
    if (button) {
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        closeKogamaDrawer();
        openSwitcherModal();
      });
    }

    return li;
  }

  function buildSilentLogoutButton(templateButton) {
    const button = templateButton.cloneNode(true);
    button.removeAttribute("id");
    button.setAttribute(SILENT_MARKER, "1");

    // Find/replace the text node "Выйти" with our label.
    let replaced = false;
    for (const child of Array.from(button.childNodes)) {
      if (
        child.nodeType === Node.TEXT_NODE &&
        child.textContent.trim().length > 0
      ) {
        child.textContent = SILENT_LOGOUT_LABEL;
        replaced = true;
        break;
      }
    }
    if (!replaced) button.textContent = SILENT_LOGOUT_LABEL;

    // Swap the start icon to a "broom"/"clear cookies" SVG.
    const iconHost = button.querySelector(".MuiButton-startIcon");
    if (iconHost) {
      iconHost.innerHTML =
        '<svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 512 512" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg"><path d="M256.5 216.8c89.3 0 161.7 41.5 161.7 92.6 0 51.2-72.4 92.6-161.7 92.6S94.8 360.6 94.8 309.5c0-51.2 72.4-92.7 161.7-92.7M256 0c-37.5 0-71.4 13.5-94.7 35.7l50.1 50c12.5-3.7 27.3-5.7 43.5-5.7 16.2 0 30.9 2 43.5 5.7l50.1-50C328.4 13.5 294.5 0 256 0zM118.5 124.6L67.7 124.5 78 197.8l43.5-44.1 27.3 27.3c-21.9 24.2-35 53.7-35 86 0 76.8 73.7 138.7 165 138.7s165-62 165-138.7c0-32.4-13.1-61.8-35.1-86.1l27.3-27.3 43.5 44.1 10.3-73.3-50.8.1c-24.7-23.7-58.9-39.8-97.3-44.7zM160 432c-26.5 0-48 21.5-48 48s21.5 48 48 48 48-21.5 48-48-21.5-48-48-48zm192 0c-26.5 0-48 21.5-48 48s21.5 48 48 48 48-21.5 48-48-21.5-48-48-48z"/></svg>';
    }

    button.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      button.disabled = true;
      try {
        await messageBackground({ type: "kas:silent-logout" });
        showToast("Cookies очищены. Перезагрузка…");
        setTimeout(() => window.location.reload(), 400);
      } catch (err) {
        showToast(`Ошибка тихого выхода: ${err.message}`, "error");
        button.disabled = false;
      }
    });

    return button;
  }

  function injectMenuItems(parts) {
    const { drawerContent, navWrap, logoutWrap, logoutButton } = parts;
    if (drawerContent.getAttribute(INJECT_MARKER) === "1") {
      return;
    }
    drawerContent.setAttribute(INJECT_MARKER, "1");

    // Pick the first <li> from the first <ul> as a template for our menu
    // item — clone its DOM so it picks up MUI's hashed class names
    // automatically. Same for the logout button.
    const firstUl = navWrap.querySelector("ul");
    const templateLi = firstUl ? firstUl.querySelector("li") : null;
    if (templateLi && firstUl) {
      const switchItem = buildSwitchItem(templateLi);
      // Insert "Сменить аккаунт" at the top of the first list, so it sits
      // right next to "Обновить профиль" exactly where the user asked.
      firstUl.insertBefore(switchItem, firstUl.firstChild);
    }

    const silentButton = buildSilentLogoutButton(logoutButton);
    logoutWrap.appendChild(silentButton);
  }

  function closeKogamaDrawer() {
    // The drawer is dismissed by clicking the backdrop (.MuiBackdrop-root).
    const backdrop = document.querySelector(
      ".MuiModal-root .MuiBackdrop-root"
    );
    if (backdrop instanceof HTMLElement) {
      backdrop.click();
      return;
    }
    // Fallback: dispatch Escape on body.
    document.body.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
    );
  }

  // ---------------- Modal ----------------

  let modalRoot = null;

  function ensureModalRoot() {
    if (modalRoot) return modalRoot;
    modalRoot = document.createElement("div");
    modalRoot.id = "kas-modal-root";
    modalRoot.hidden = true;
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
  function tryInject() {
    const parts = findDrawerContent();
    if (parts) {
      try {
        injectMenuItems(parts);
      } catch (err) {
        console.error("[Kogama Account Switcher] inject failed:", err);
      }
    }
  }

  const observer = new MutationObserver(tryInject);
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });

  // Initial pass in case the menu is already open on load.
  tryInject();

  console.info("[Kogama Account Switcher] content script loaded");
})();
