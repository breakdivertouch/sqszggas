// sidepanel.js — UI controller. Talks to the content script (and through it the
// page's MAIN world) via chrome.tabs.sendMessage / chrome.runtime.

const $ = (id) => document.getElementById(id);

const els = {
  type: $("type"),
  op: $("op"),
  value: $("value"),
  value2: $("value2"),
  value2Wrap: $("value2-wrap"),
  status: $("status"),
  btnFirst: $("btn-first"),
  btnNext: $("btn-next"),
  btnNew: $("btn-new"),
  btnRefresh: $("btn-refresh"),
  results: $("results"),
  resultsCount: $("results-count"),
  resultsTruncated: $("results-truncated"),
  frozen: $("frozen"),
  frozenCount: $("frozen-count"),
};

let activeTabId = null;
let lastResults = []; // local cache from page
let frozenList = [];
let refreshTimer = null;

// ---- Tab management --------------------------------------------------------

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tab || null;
}

async function ensureContentScript(tabId) {
  // Try to ping; if no response, attempt to inject the content script.
  try {
    const r = await sendToTab(tabId, { cmd: "ping" }, 500);
    if (r && r.pong) return true;
  } catch (e) {
    // ignore
  }

  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content.js"],
    });
    // Give the injected script a tick to install.
    await new Promise((r) => setTimeout(r, 150));
    const r = await sendToTab(tabId, { cmd: "ping" }, 800);
    return !!(r && r.pong);
  } catch (err) {
    console.warn("[WCE] could not inject content script:", err);
    return false;
  }
}

function sendToTab(tabId, payload, timeoutMs = 4000) {
  return new Promise((resolve, reject) => {
    let done = false;
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      reject(new Error("Timed out waiting for page response"));
    }, timeoutMs);

    try {
      chrome.tabs.sendMessage(
        tabId,
        { type: "WCE_TO_PAGE", requestId: String(Math.random()), payload },
        (resp) => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          if (!resp || !resp.ok) {
            reject(new Error("No response from content script"));
            return;
          }
          resolve(resp.payload);
        }
      );
    } catch (e) {
      if (done) return;
      done = true;
      clearTimeout(timer);
      reject(e);
    }
  });
}

async function call(payload) {
  if (activeTabId == null) {
    const tab = await getActiveTab();
    if (!tab) throw new Error("No active tab");
    activeTabId = tab.id;
  }
  const ok = await ensureContentScript(activeTabId);
  if (!ok) throw new Error("Cannot attach to this page (chrome:// or restricted URL?)");
  return sendToTab(activeTabId, payload);
}

// ---- UI helpers ------------------------------------------------------------

function setStatus(text, kind) {
  els.status.textContent = text;
  els.status.classList.remove("ok", "err");
  if (kind) els.status.classList.add(kind);
}

function updateOpVisibility() {
  const op = els.op.value;
  const valueless = ["increased", "decreased", "changed", "unchanged", "unknown"].includes(op);
  els.value.disabled = valueless;
  els.value.placeholder = valueless ? "(not used)" : "value";
  els.value2Wrap.style.display = op === "between" ? "" : "none";
}

function clearChildren(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

function fmt(value) {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (typeof value === "string") return JSON.stringify(value);
  return String(value);
}

function renderResults(payload) {
  if (!payload) {
    els.resultsCount.textContent = "0";
    clearChildren(els.results);
    els.resultsTruncated.style.display = "none";
    return;
  }
  lastResults = payload.sample || [];
  els.resultsCount.textContent = String(payload.total || 0);
  els.resultsTruncated.style.display = payload.truncated ? "" : "none";

  clearChildren(els.results);

  if (lastResults.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = payload.total
      ? "No items in current page of results."
      : "No results yet. Set a Type + Compare and run First Scan.";
    els.results.appendChild(empty);
    return;
  }

  const frag = document.createDocumentFragment();
  for (const r of lastResults) {
    const row = document.createElement("div");
    row.className = "row-item";
    row.dataset.id = r.id;

    const path = document.createElement("span");
    path.className = "col-path";
    path.title = r.pathStr;
    path.textContent = r.pathStr;

    const value = document.createElement("span");
    value.className = "col-value";
    value.textContent = fmt(r.value);

    const type = document.createElement("span");
    type.className = "col-type";
    type.textContent = r.type;

    const actions = document.createElement("span");
    actions.className = "col-actions";

    const editBtn = document.createElement("button");
    editBtn.className = "tiny";
    editBtn.textContent = "Edit";
    editBtn.addEventListener("click", () => onEdit(r));

    const freezeBtn = document.createElement("button");
    freezeBtn.className = "tiny primary";
    freezeBtn.textContent = "Freeze";
    freezeBtn.addEventListener("click", () => onFreeze(r));

    actions.appendChild(editBtn);
    actions.appendChild(freezeBtn);

    row.appendChild(path);
    row.appendChild(value);
    row.appendChild(type);
    row.appendChild(actions);
    frag.appendChild(row);
  }
  els.results.appendChild(frag);
}

function renderFrozen(list) {
  frozenList = list || [];
  els.frozenCount.textContent = String(frozenList.length);
  clearChildren(els.frozen);

  if (frozenList.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "No frozen values yet. Use Freeze on a result.";
    els.frozen.appendChild(empty);
    return;
  }

  const frag = document.createDocumentFragment();
  for (const e of frozenList) {
    const row = document.createElement("div");
    row.className = "row-item" + (e.enabled ? "" : " disabled");

    const name = document.createElement("span");
    name.className = "col-name";
    const nameInput = document.createElement("input");
    nameInput.className = "name-input";
    nameInput.value = e.name;
    nameInput.title = e.path.join(" > ");
    nameInput.addEventListener("change", async () => {
      try {
        const r = await call({ cmd: "freezeUpdate", freezeId: e.freezeId, name: nameInput.value });
        if (r.ok) renderFrozen(r.list);
      } catch (err) {
        setStatus("Error: " + err.message, "err");
      }
    });
    name.appendChild(nameInput);

    const value = document.createElement("span");
    value.className = "col-value";
    const valInput = document.createElement("input");
    valInput.className = "value-input";
    valInput.value = e.value == null ? "" : String(e.value);
    valInput.addEventListener("change", async () => {
      try {
        const r = await call({
          cmd: "freezeUpdate",
          freezeId: e.freezeId,
          value: valInput.value,
        });
        if (r.ok) renderFrozen(r.list);
        else setStatus("Error: " + (r.error || "update failed"), "err");
      } catch (err) {
        setStatus("Error: " + err.message, "err");
      }
    });
    value.appendChild(valInput);

    const cur = document.createElement("span");
    cur.className = "col-current";
    cur.textContent = fmt(e.currentValue);
    if (String(e.currentValue) !== String(e.value)) cur.classList.add("diff");

    const actions = document.createElement("span");
    actions.className = "col-actions";

    const toggle = document.createElement("label");
    toggle.className = "toggle";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = !!e.enabled;
    cb.addEventListener("change", async () => {
      try {
        const r = await call({
          cmd: "freezeUpdate",
          freezeId: e.freezeId,
          enabled: cb.checked,
        });
        if (r.ok) renderFrozen(r.list);
      } catch (err) {
        setStatus("Error: " + err.message, "err");
      }
    });
    toggle.appendChild(cb);
    const tlabel = document.createElement("span");
    tlabel.textContent = "On";
    toggle.appendChild(tlabel);

    const rmBtn = document.createElement("button");
    rmBtn.className = "tiny danger";
    rmBtn.textContent = "Remove";
    rmBtn.addEventListener("click", async () => {
      try {
        const r = await call({ cmd: "freezeRemove", freezeId: e.freezeId });
        if (r.ok) renderFrozen(r.list);
      } catch (err) {
        setStatus("Error: " + err.message, "err");
      }
    });

    actions.appendChild(toggle);
    actions.appendChild(rmBtn);

    row.appendChild(name);
    row.appendChild(value);
    row.appendChild(cur);
    row.appendChild(actions);
    frag.appendChild(row);
  }
  els.frozen.appendChild(frag);
}

// ---- Actions ---------------------------------------------------------------

async function onFirstScan() {
  const type = els.type.value;
  const op = els.op.value;
  const value = els.value.value;
  const value2 = els.value2.value;

  setStatus("Scanning…");
  try {
    const r = await call({ cmd: "firstScan", type, op, value, value2 });
    if (r.error) {
      setStatus("Error: " + r.error, "err");
      return;
    }
    setStatus("Found " + r.total + " result(s)", "ok");
    renderResults(r);
  } catch (err) {
    setStatus("Error: " + err.message, "err");
  }
}

async function onNextScan() {
  const op = els.op.value;
  const value = els.value.value;
  const value2 = els.value2.value;

  setStatus("Filtering…");
  try {
    const r = await call({ cmd: "nextScan", op, value, value2 });
    if (r.error) {
      setStatus("Error: " + r.error, "err");
      return;
    }
    setStatus(r.total + " match(es) remain", "ok");
    renderResults(r);
  } catch (err) {
    setStatus("Error: " + err.message, "err");
  }
}

async function onNewScan() {
  setStatus("Cleared", "ok");
  try {
    const r = await call({ cmd: "newScan" });
    renderResults(r);
  } catch (err) {
    setStatus("Error: " + err.message, "err");
  }
}

async function onRefresh() {
  try {
    const r = await call({ cmd: "refresh" });
    renderResults(r);
    const fr = await call({ cmd: "freezeList" });
    if (fr && fr.ok) renderFrozen(fr.list);
  } catch (err) {
    setStatus("Error: " + err.message, "err");
  }
}

async function onEdit(r) {
  const next = window.prompt("New value for " + r.pathStr, String(r.value));
  if (next == null) return;
  try {
    const resp = await call({ cmd: "write", path: r.path, type: r.type, value: next });
    if (!resp.ok) {
      setStatus("Write failed: " + (resp.error || "unknown"), "err");
      return;
    }
    setStatus("Wrote " + fmt(resp.value), "ok");
    onRefresh();
  } catch (err) {
    setStatus("Error: " + err.message, "err");
  }
}

async function onFreeze(r) {
  const name = window.prompt(
    "Name for this saved value:",
    r.pathStr.replace(/^window\./, "")
  ) ;
  if (name == null) return;
  try {
    const resp = await call({
      cmd: "freezeAdd",
      path: r.path,
      type: r.type,
      value: r.value,
      name: name,
    });
    if (!resp.ok) {
      setStatus("Freeze failed: " + (resp.error || "unknown"), "err");
      return;
    }
    renderFrozen(resp.list);
    setStatus("Frozen", "ok");
  } catch (err) {
    setStatus("Error: " + err.message, "err");
  }
}

// ---- Init ------------------------------------------------------------------

async function init() {
  els.op.addEventListener("change", updateOpVisibility);
  updateOpVisibility();

  els.btnFirst.addEventListener("click", onFirstScan);
  els.btnNext.addEventListener("click", onNextScan);
  els.btnNew.addEventListener("click", onNewScan);
  els.btnRefresh.addEventListener("click", onRefresh);

  // Track active tab so we always talk to whatever the user is looking at.
  const tab = await getActiveTab();
  if (tab) activeTabId = tab.id;

  chrome.tabs.onActivated.addListener(async (info) => {
    activeTabId = info.tabId;
    setStatus("attaching…");
    await attach();
  });
  chrome.tabs.onUpdated.addListener((tabId, info) => {
    if (tabId === activeTabId && info.status === "complete") attach();
  });

  await attach();

  // Periodically refresh the frozen list so "Current" column is live.
  refreshTimer = setInterval(async () => {
    if (document.hidden) return;
    try {
      const fr = await call({ cmd: "freezeList" });
      if (fr && fr.ok) renderFrozen(fr.list);
    } catch (e) {
      // tab might be gone or not injectable
    }
  }, 800);
}

async function attach() {
  if (activeTabId == null) {
    setStatus("No active tab", "err");
    return;
  }
  try {
    const ok = await ensureContentScript(activeTabId);
    if (!ok) {
      setStatus("Cannot attach to this page", "err");
      return;
    }
    setStatus("Attached", "ok");
    // Pull existing frozen list (state lives in the page).
    const fr = await call({ cmd: "freezeList" });
    if (fr && fr.ok) renderFrozen(fr.list);
    // Also refresh results in case the page already had a scan.
    const rr = await call({ cmd: "refresh" });
    renderResults(rr);
  } catch (err) {
    setStatus("Error: " + err.message, "err");
  }
}

init();
