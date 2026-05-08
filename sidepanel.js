// sidepanel.js — UI controller. Talks to content scripts in every frame of the
// active tab via chrome.tabs.sendMessage(..., {frameId}). Each frame has its
// own injected.js MAIN-world state (scans + frozen entries).

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
  frame: $("frame"),
  btnFramesRefresh: $("btn-frames-refresh"),
};

let activeTabId = null;
let frameList = []; // [{ frameId, url, label }]
let activeFrame = "all"; // "all" | numeric frameId
let lastResults = [];
let frozenList = [];
let refreshTimer = null;
let framesRefreshTimer = null;

const ALL = "all";

// ---- Tab / frame management ------------------------------------------------

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tab || null;
}

function frameLabel(frame) {
  if (frame.frameId === 0) return "main";
  let url = frame.url || "";
  if (!url || url === "about:blank") return "iframe #" + frame.frameId + " (blank)";
  try {
    const u = new URL(url);
    let path = u.pathname;
    if (path.length > 28) path = "…" + path.slice(-27);
    return "iframe " + u.host + path;
  } catch (e) {
    return "iframe #" + frame.frameId;
  }
}

async function refreshFrames() {
  if (activeTabId == null) {
    frameList = [];
    renderFrameSelect();
    return;
  }
  let frames;
  try {
    frames = await chrome.webNavigation.getAllFrames({ tabId: activeTabId });
  } catch (e) {
    frames = [{ frameId: 0, url: "" }];
  }
  if (!frames) frames = [];
  frames.sort((a, b) => a.frameId - b.frameId);
  frameList = frames.map((f) => ({
    frameId: f.frameId,
    url: f.url || "",
    label: frameLabel(f),
  }));
  renderFrameSelect();
}

function renderFrameSelect() {
  const prev = els.frame.value;
  while (els.frame.firstChild) els.frame.removeChild(els.frame.firstChild);
  const all = document.createElement("option");
  all.value = ALL;
  all.textContent = "All frames (" + frameList.length + ")";
  els.frame.appendChild(all);
  for (const f of frameList) {
    const opt = document.createElement("option");
    opt.value = String(f.frameId);
    opt.textContent = f.label;
    els.frame.appendChild(opt);
  }
  const wanted = prev || activeFrame;
  if (wanted === ALL || wanted == null) {
    els.frame.value = ALL;
    activeFrame = ALL;
  } else {
    const exists = frameList.some((f) => String(f.frameId) === String(wanted));
    els.frame.value = exists ? String(wanted) : ALL;
    activeFrame = exists ? Number(wanted) : ALL;
  }
}

// ---- Messaging -------------------------------------------------------------

function sendToFrame(tabId, frameId, payload, timeoutMs = 4000) {
  return new Promise((resolve, reject) => {
    let done = false;
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      reject(new Error("Timed out"));
    }, timeoutMs);

    const opts = frameId == null ? undefined : { frameId };
    try {
      chrome.tabs.sendMessage(
        tabId,
        { type: "WCE_TO_PAGE", requestId: String(Math.random()), payload },
        opts,
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

async function ensureFrameAttached(tabId, frameId) {
  try {
    const r = await sendToFrame(tabId, frameId, { cmd: "ping" }, 600);
    if (r && r.pong) return true;
  } catch (e) {
    // not attached yet
  }
  try {
    await chrome.scripting.executeScript({
      target: { tabId, frameIds: [frameId] },
      files: ["content.js"],
    });
    await new Promise((r) => setTimeout(r, 100));
    const r = await sendToFrame(tabId, frameId, { cmd: "ping" }, 800);
    return !!(r && r.pong);
  } catch (err) {
    return false;
  }
}

async function callFrame(frameId, payload) {
  if (activeTabId == null) {
    const tab = await getActiveTab();
    if (!tab) throw new Error("No active tab");
    activeTabId = tab.id;
  }
  const ok = await ensureFrameAttached(activeTabId, frameId);
  if (!ok) throw new Error("Cannot attach to frame " + frameId + " (restricted URL?)");
  return sendToFrame(activeTabId, frameId, payload);
}

// Send to selected frame, or fan out to ALL frames if "all" or fanout=true.
async function callActive(payload, { fanout = false, perFrameTimeout = 4000 } = {}) {
  if (activeTabId == null) {
    const tab = await getActiveTab();
    if (!tab) throw new Error("No active tab");
    activeTabId = tab.id;
  }
  if (!fanout && activeFrame !== ALL) {
    return [
      { frameId: Number(activeFrame), payload: await callFrame(Number(activeFrame), payload) },
    ];
  }
  const results = [];
  for (const f of frameList) {
    try {
      const ok = await ensureFrameAttached(activeTabId, f.frameId);
      if (!ok) continue;
      const r = await sendToFrame(activeTabId, f.frameId, payload, perFrameTimeout);
      results.push({ frameId: f.frameId, payload: r });
    } catch (e) {
      // skip frame
    }
  }
  return results;
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

function findFrameLabel(frameId) {
  const f = frameList.find((x) => x.frameId === frameId);
  return f ? f.label : "frame#" + frameId;
}

// ---- Results rendering -----------------------------------------------------

function mergeResultPayloads(arr) {
  let total = 0;
  let truncated = false;
  const sample = [];
  for (const { frameId, payload } of arr) {
    if (!payload) continue;
    total += payload.total || 0;
    truncated = truncated || !!payload.truncated;
    for (const r of payload.sample || []) {
      sample.push({ ...r, frameId });
    }
  }
  return { total, truncated, sample: sample.slice(0, 1000) };
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
    const fid = r.frameId == null ? null : Number(r.frameId);
    const label = fid != null ? findFrameLabel(fid) : "main";
    path.title = "[" + label + "] " + r.pathStr;
    path.textContent = (fid != null && fid !== 0 ? "[" + label + "] " : "") + r.pathStr;

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

    const fid = e.frameId == null ? 0 : Number(e.frameId);

    const name = document.createElement("span");
    name.className = "col-name";
    const nameInput = document.createElement("input");
    nameInput.className = "name-input";
    nameInput.value = e.name;
    nameInput.title = (fid !== 0 ? "[" + findFrameLabel(fid) + "] " : "") + (e.path || []).join(" > ");
    nameInput.addEventListener("change", async () => {
      try {
        const r = await callFrame(fid, {
          cmd: "freezeUpdate",
          freezeId: e.freezeId,
          name: nameInput.value,
        });
        if (r && r.ok) await refreshFrozen();
      } catch (err) {
        setStatus("Error: " + err.message, "err");
      }
    });
    name.appendChild(nameInput);
    if (fid !== 0) {
      const tag = document.createElement("div");
      tag.className = "muted";
      tag.style.fontSize = "10px";
      tag.textContent = "▸ " + findFrameLabel(fid);
      name.appendChild(tag);
    }

    const value = document.createElement("span");
    value.className = "col-value";
    const valInput = document.createElement("input");
    valInput.className = "value-input";
    valInput.value = e.value == null ? "" : String(e.value);
    valInput.addEventListener("change", async () => {
      try {
        const r = await callFrame(fid, {
          cmd: "freezeUpdate",
          freezeId: e.freezeId,
          value: valInput.value,
        });
        if (r && r.ok) await refreshFrozen();
        else setStatus("Error: " + ((r && r.error) || "update failed"), "err");
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
        const r = await callFrame(fid, {
          cmd: "freezeUpdate",
          freezeId: e.freezeId,
          enabled: cb.checked,
        });
        if (r && r.ok) await refreshFrozen();
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
        const r = await callFrame(fid, { cmd: "freezeRemove", freezeId: e.freezeId });
        if (r && r.ok) await refreshFrozen();
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

async function refreshFrozen() {
  // Always aggregate frozen list across all frames so user sees everything.
  try {
    const arr = await callActive({ cmd: "freezeList" }, { fanout: true });
    const merged = [];
    for (const { frameId, payload } of arr) {
      if (!payload || !payload.list) continue;
      for (const e of payload.list) {
        merged.push({ ...e, frameId });
      }
    }
    renderFrozen(merged);
  } catch (e) {
    // ignore
  }
}

// ---- Actions ---------------------------------------------------------------

async function onFirstScan() {
  const type = els.type.value;
  const op = els.op.value;
  const value = els.value.value;
  const value2 = els.value2.value;

  setStatus("Scanning…");
  try {
    const arr = await callActive({ cmd: "firstScan", type, op, value, value2 });
    const errs = arr.filter((x) => x.payload && x.payload.error);
    if (errs.length && arr.length === errs.length) {
      setStatus("Error: " + errs[0].payload.error, "err");
      return;
    }
    const merged = mergeResultPayloads(arr);
    setStatus(
      "Found " + merged.total + " result(s) across " + arr.length + " frame(s)",
      "ok"
    );
    renderResults(merged);
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
    const arr = await callActive({ cmd: "nextScan", op, value, value2 });
    const merged = mergeResultPayloads(arr);
    setStatus(merged.total + " match(es) remain", "ok");
    renderResults(merged);
  } catch (err) {
    setStatus("Error: " + err.message, "err");
  }
}

async function onNewScan() {
  setStatus("Cleared", "ok");
  try {
    await callActive({ cmd: "newScan" }, { fanout: true });
    renderResults({ total: 0, sample: [], truncated: false });
  } catch (err) {
    setStatus("Error: " + err.message, "err");
  }
}

async function onRefresh() {
  try {
    await refreshFrames();
    const arr = await callActive({ cmd: "refresh" });
    renderResults(mergeResultPayloads(arr));
    await refreshFrozen();
  } catch (err) {
    setStatus("Error: " + err.message, "err");
  }
}

async function onEdit(r) {
  const next = window.prompt("New value for " + r.pathStr, String(r.value));
  if (next == null) return;
  try {
    const fid = r.frameId == null ? 0 : Number(r.frameId);
    const resp = await callFrame(fid, {
      cmd: "write",
      path: r.path,
      type: r.type,
      value: next,
    });
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
  );
  if (name == null) return;
  try {
    const fid = r.frameId == null ? 0 : Number(r.frameId);
    const resp = await callFrame(fid, {
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
    await refreshFrozen();
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
  els.btnFramesRefresh.addEventListener("click", async () => {
    await refreshFrames();
    setStatus("Frames refreshed (" + frameList.length + ")", "ok");
  });

  els.frame.addEventListener("change", () => {
    const v = els.frame.value;
    activeFrame = v === ALL ? ALL : Number(v);
  });

  // Track active tab.
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

  // React to new frames being created in our tab so dynamically inserted
  // iframes (e.g. WebGL game frame added 3 minutes after page load) show up.
  if (chrome.webNavigation && chrome.webNavigation.onCommitted) {
    chrome.webNavigation.onCommitted.addListener((details) => {
      if (details.tabId !== activeTabId) return;
      setTimeout(refreshFrames, 250);
    });
  }
  if (chrome.webNavigation && chrome.webNavigation.onCompleted) {
    chrome.webNavigation.onCompleted.addListener((details) => {
      if (details.tabId !== activeTabId) return;
      setTimeout(refreshFrames, 250);
    });
  }

  await attach();

  // Periodic light refresh of the frozen list's "Current" column.
  refreshTimer = setInterval(async () => {
    if (document.hidden) return;
    try {
      await refreshFrozen();
    } catch (e) {
      /* ignore */
    }
  }, 800);

  // Safety net — re-fetch frame list every few seconds.
  framesRefreshTimer = setInterval(() => {
    if (document.hidden) return;
    refreshFrames();
  }, 3000);
}

async function attach() {
  if (activeTabId == null) {
    setStatus("No active tab", "err");
    return;
  }
  try {
    await refreshFrames();
    const ok = await ensureFrameAttached(activeTabId, 0);
    setStatus(
      ok ? "Attached (" + frameList.length + " frame(s))" : "Cannot attach to this page",
      ok ? "ok" : "err"
    );
    if (!ok) return;
    await refreshFrozen();
    const arr = await callActive({ cmd: "refresh" });
    renderResults(mergeResultPayloads(arr));
  } catch (err) {
    setStatus("Error: " + err.message, "err");
  }
}

init();
