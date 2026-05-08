// injected.js — runs in the page's MAIN world.
// Implements the scanner, value reader/writer, and freeze loop.
// Communicates with the extension via window.postMessage (bridged by content.js).

(function () {
  if (window.__WEB_CHEAT_ENGINE_INSTALLED__) return;
  window.__WEB_CHEAT_ENGINE_INSTALLED__ = true;

  const SOURCE_EXT = "WCE_EXT";
  const SOURCE_PAGE = "WCE_PAGE";

  // ---- State ----------------------------------------------------------------

  // Last scan results: array of { id, path: string[], type: string, value: any }
  let lastResults = [];
  // Pre-scan snapshot used by "unknown initial value" mode.
  let unknownSnapshot = null; // Map<id, value>
  let nextId = 1;
  let nextFreezeId = 1;

  // Frozen entries: id -> { freezeId, name, path, value, type, enabled }
  const frozen = new Map();
  let freezeTimer = null;

  // ---- Helpers --------------------------------------------------------------

  function isPlainTypedArray(obj) {
    return ArrayBuffer.isView(obj) && !(obj instanceof DataView);
  }

  function isProbablyDOM(obj) {
    if (typeof Node !== "undefined" && obj instanceof Node) return true;
    if (typeof Window !== "undefined" && obj instanceof Window && obj !== window) return true;
    if (typeof CSSStyleDeclaration !== "undefined" && obj instanceof CSSStyleDeclaration) return true;
    if (typeof Event !== "undefined" && obj instanceof Event) return true;
    return false;
  }

  // Resolve a path from window. Returns the value at path, or undefined.
  function resolveByPath(path) {
    let obj = window;
    for (let i = 0; i < path.length; i++) {
      if (obj == null) return undefined;
      try {
        obj = obj[path[i]];
      } catch (e) {
        return undefined;
      }
    }
    return obj;
  }

  // Resolve the parent object + key for a path. Returns null if not resolvable.
  function resolveParent(path) {
    if (!path || path.length === 0) return null;
    let obj = window;
    for (let i = 0; i < path.length - 1; i++) {
      if (obj == null) return null;
      try {
        obj = obj[path[i]];
      } catch (e) {
        return null;
      }
    }
    if (obj == null) return null;
    return { parent: obj, key: path[path.length - 1] };
  }

  // ---- Type predicates ------------------------------------------------------

  // Filter what kinds of leaf values we record during a scan.
  // type: "byte" | "word" | "dword" | "qword" | "int" | "float" | "double"
  //     | "anynumber" | "string" | "boolean"
  function typeMatches(type, value) {
    const t = typeof value;
    switch (type) {
      case "byte":
        return t === "number" && Number.isInteger(value) && value >= -128 && value <= 255;
      case "word":
        return t === "number" && Number.isInteger(value) && value >= -32768 && value <= 65535;
      case "dword":
        return (
          t === "number" &&
          Number.isInteger(value) &&
          value >= -2147483648 &&
          value <= 4294967295
        );
      case "qword":
        if (t === "bigint") return true;
        return t === "number" && Number.isInteger(value);
      case "int":
        return t === "number" && Number.isInteger(value);
      case "float":
      case "double":
        return t === "number" && Number.isFinite(value) && !Number.isInteger(value);
      case "anynumber":
        return t === "number" && Number.isFinite(value);
      case "string":
        return t === "string";
      case "boolean":
        return t === "boolean";
      default:
        return false;
    }
  }

  // Parse a user input string into a value matching the chosen type.
  function parseInput(type, input) {
    if (input == null) return null;
    switch (type) {
      case "byte":
      case "word":
      case "dword":
      case "int": {
        const n = Number(input);
        if (!Number.isFinite(n) || !Number.isInteger(n)) return null;
        return n;
      }
      case "qword": {
        try {
          if (/^-?\d+$/.test(String(input).trim())) return BigInt(input);
        } catch (e) {}
        const n = Number(input);
        if (!Number.isFinite(n) || !Number.isInteger(n)) return null;
        return n;
      }
      case "float":
      case "double":
      case "anynumber": {
        const n = Number(input);
        if (!Number.isFinite(n)) return null;
        return n;
      }
      case "string":
        return String(input);
      case "boolean": {
        const s = String(input).toLowerCase().trim();
        if (s === "true" || s === "1") return true;
        if (s === "false" || s === "0") return false;
        return null;
      }
      default:
        return null;
    }
  }

  // ---- Comparisons ----------------------------------------------------------

  // op: "eq" | "ne" | "gt" | "lt" | "ge" | "le" | "between"
  //   | "increased" | "decreased" | "changed" | "unchanged"
  //   | "increased_by" | "decreased_by"
  function compareValue(op, current, target, prev, target2) {
    switch (op) {
      case "eq":
        if (typeof current === "bigint" || typeof target === "bigint") {
          try { return BigInt(current) === BigInt(target); } catch (e) { return false; }
        }
        return current === target;
      case "ne":
        return current !== target;
      case "gt":
        return current > target;
      case "lt":
        return current < target;
      case "ge":
        return current >= target;
      case "le":
        return current <= target;
      case "between": {
        const lo = Math.min(Number(target), Number(target2));
        const hi = Math.max(Number(target), Number(target2));
        return Number(current) >= lo && Number(current) <= hi;
      }
      case "increased":
        return prev != null && current > prev;
      case "decreased":
        return prev != null && current < prev;
      case "changed":
        return prev != null && current !== prev;
      case "unchanged":
        return prev != null && current === prev;
      case "increased_by":
        return prev != null && Number(current) - Number(prev) === Number(target);
      case "decreased_by":
        return prev != null && Number(prev) - Number(current) === Number(target);
      default:
        return false;
    }
  }

  // ---- First scan -----------------------------------------------------------

  // Walk reachable values from window and collect all leaves matching `type`.
  // Optionally filter further with `predicate(value) -> boolean`.
  // Returns array of { id, path, type, value }.
  function collectLeaves(type, predicate, opts) {
    const maxResults = (opts && opts.maxResults) || 200000;
    const maxDepth = (opts && opts.maxDepth) || 8;
    const seen = new WeakSet();
    const results = [];
    const queue = [{ obj: window, path: [], depth: 0 }];

    while (queue.length && results.length < maxResults) {
      const { obj, path, depth } = queue.shift();
      if (obj == null) continue;
      const ot = typeof obj;
      if (ot !== "object" && ot !== "function") continue;
      if (seen.has(obj)) continue;
      seen.add(obj);

      // Skip DOM stuff and other heavy native objects.
      if (depth > 0 && isProbablyDOM(obj)) continue;
      if (obj === document) continue;
      if (obj === navigator) continue;
      if (obj === location) continue;
      if (obj === history) continue;
      if (obj === performance) continue;

      if (depth > maxDepth) continue;

      // Iterate children.
      let entries;
      try {
        if (Array.isArray(obj) || isPlainTypedArray(obj)) {
          const len = obj.length;
          entries = new Array(Math.min(len, 100000));
          for (let i = 0; i < entries.length; i++) entries[i] = String(i);
        } else {
          entries = Object.getOwnPropertyNames(obj);
        }
      } catch (e) {
        continue;
      }

      for (let i = 0; i < entries.length; i++) {
        if (results.length >= maxResults) break;
        const key = entries[i];
        let val;
        try {
          // Avoid invoking pure getters as they can have side effects.
          const desc = Object.getOwnPropertyDescriptor(obj, key);
          if (!desc) continue;
          if (typeof desc.get === "function" && !("value" in desc)) continue;
          val = desc.value;
        } catch (e) {
          continue;
        }

        const t = typeof val;
        const newPath = path.concat([key]);

        if (
          t === "number" ||
          t === "string" ||
          t === "boolean" ||
          t === "bigint"
        ) {
          if (typeMatches(type, val) && (!predicate || predicate(val))) {
            results.push({
              id: nextId++,
              path: newPath,
              type: t,
              value: val,
            });
          }
        } else if (t === "object" || t === "function") {
          // Don't recurse into DOM nodes / Element prototypes.
          if (val == null) continue;
          if (val === window) continue;
          queue.push({ obj: val, path: newPath, depth: depth + 1 });
        }
      }
    }

    return results;
  }

  function firstScan({ type, op, value, value2 }) {
    nextId = 1;
    unknownSnapshot = null;

    if (op === "unknown") {
      // Snapshot all matching values without filtering.
      lastResults = collectLeaves(type, null, {});
      unknownSnapshot = new Map();
      for (const r of lastResults) unknownSnapshot.set(r.id, r.value);
      return summarize(lastResults);
    }

    const target = parseInput(type, value);
    const target2 = value2 != null ? parseInput(type, value2) : null;
    if (
      ["eq", "ne", "gt", "lt", "ge", "le", "between", "increased_by", "decreased_by"].includes(
        op
      ) &&
      target == null
    ) {
      return { error: "Invalid value for the chosen type" };
    }

    const predicate = (v) => compareValue(op, v, target, null, target2);
    lastResults = collectLeaves(type, predicate, {});
    return summarize(lastResults);
  }

  // ---- Next scan ------------------------------------------------------------

  function nextScan({ op, value, value2 }) {
    if (!lastResults || lastResults.length === 0) {
      return { error: "No previous results. Run a First Scan first." };
    }

    const survivors = [];
    for (const r of lastResults) {
      const cur = resolveByPath(r.path);
      if (cur == null && typeof cur !== "string") {
        // path may be gone; drop
        continue;
      }
      if (typeof cur !== r.type) {
        // Type changed; drop.
        continue;
      }

      let prev = r.value;
      if (op === "changed" || op === "unchanged" || op === "increased" || op === "decreased") {
        // Compare against the previously recorded value of THIS entry.
      }

      let target = null;
      let target2 = null;
      if (
        ["eq", "ne", "gt", "lt", "ge", "le", "between", "increased_by", "decreased_by"].includes(
          op
        )
      ) {
        target = parseInput(r.type === "bigint" ? "qword" : typeToInput(r.type), value);
        if (target == null) continue;
        if (op === "between") {
          target2 = parseInput(typeToInput(r.type), value2);
          if (target2 == null) continue;
        }
      }

      if (compareValue(op, cur, target, prev, target2)) {
        survivors.push({ id: r.id, path: r.path, type: r.type, value: cur });
      }
    }

    lastResults = survivors;
    return summarize(lastResults);
  }

  // Map JS typeof to a parser type for parseInput.
  function typeToInput(t) {
    switch (t) {
      case "number":
        return "anynumber";
      case "string":
        return "string";
      case "boolean":
        return "boolean";
      case "bigint":
        return "qword";
      default:
        return "string";
    }
  }

  // ---- Read / Write / Freeze ------------------------------------------------

  function readByPath(path) {
    const v = resolveByPath(path);
    return { type: typeof v, value: serializeValue(v) };
  }

  function writeByPath(path, type, raw) {
    const ref = resolveParent(path);
    if (!ref) return { ok: false, error: "Path not resolvable" };
    const parsed = parseInput(typeToInputForWrite(type, raw), raw);
    if (parsed === null && type !== "string") {
      return { ok: false, error: "Invalid value" };
    }
    try {
      ref.parent[ref.key] = parsed === null ? raw : parsed;
      return { ok: true, value: serializeValue(ref.parent[ref.key]) };
    } catch (e) {
      return { ok: false, error: String(e && e.message || e) };
    }
  }

  function typeToInputForWrite(originalType, raw) {
    // Use the original JS type to decide how to coerce input.
    if (originalType === "number") {
      return Number.isInteger(Number(raw)) ? "int" : "double";
    }
    if (originalType === "bigint") return "qword";
    if (originalType === "boolean") return "boolean";
    return "string";
  }

  function serializeValue(v) {
    const t = typeof v;
    if (t === "bigint") return v.toString() + "n";
    if (t === "number" || t === "string" || t === "boolean") return v;
    if (v === null) return null;
    return String(v);
  }

  function freezeAdd({ path, name, value, type }) {
    const id = nextFreezeId++;
    // Coerce the freeze value to a JS value usable for writing.
    let parsedValue = value;
    if (type === "bigint" && typeof value === "string") {
      try {
        parsedValue = BigInt(value.replace(/n$/, ""));
      } catch (e) {}
    }
    const entry = {
      freezeId: id,
      name: name || joinPath(path),
      path: path,
      value: parsedValue,
      type: type,
      enabled: true,
    };
    frozen.set(id, entry);
    ensureFreezeLoop();
    return { ok: true, freezeId: id, list: getFreezeList() };
  }

  function freezeRemove({ freezeId }) {
    frozen.delete(freezeId);
    if (frozen.size === 0) stopFreezeLoop();
    return { ok: true, list: getFreezeList() };
  }

  function freezeUpdate({ freezeId, name, value, enabled }) {
    const entry = frozen.get(freezeId);
    if (!entry) return { ok: false, error: "Not found" };
    if (typeof name === "string") entry.name = name;
    if (value !== undefined) {
      let parsed = value;
      if (entry.type === "number" && typeof value !== "number") {
        parsed = Number(value);
        if (!Number.isFinite(parsed)) return { ok: false, error: "Invalid number" };
      } else if (entry.type === "bigint") {
        try {
          parsed = typeof value === "bigint" ? value : BigInt(String(value).replace(/n$/, ""));
        } catch (e) {
          return { ok: false, error: "Invalid bigint" };
        }
      } else if (entry.type === "boolean") {
        parsed = value === true || value === "true" || value === 1 || value === "1";
      } else if (entry.type === "string") {
        parsed = String(value);
      }
      entry.value = parsed;
    }
    if (typeof enabled === "boolean") entry.enabled = enabled;
    return { ok: true, list: getFreezeList() };
  }

  function getFreezeList() {
    return Array.from(frozen.values()).map((e) => ({
      freezeId: e.freezeId,
      name: e.name,
      path: e.path,
      value: serializeValue(e.value),
      type: e.type,
      enabled: e.enabled,
      currentValue: serializeValue(resolveByPath(e.path)),
    }));
  }

  function ensureFreezeLoop() {
    if (freezeTimer) return;
    freezeTimer = setInterval(() => {
      for (const entry of frozen.values()) {
        if (!entry.enabled) continue;
        const ref = resolveParent(entry.path);
        if (!ref) continue;
        try {
          if (ref.parent[ref.key] !== entry.value) {
            ref.parent[ref.key] = entry.value;
          }
        } catch (e) {
          // Ignore write failures (e.g. read-only props).
        }
      }
    }, 50);
  }

  function stopFreezeLoop() {
    if (freezeTimer) {
      clearInterval(freezeTimer);
      freezeTimer = null;
    }
  }

  // ---- Result paging --------------------------------------------------------

  function summarize(results) {
    const total = results.length;
    const cap = 1000;
    const sample = results.slice(0, cap).map((r) => ({
      id: r.id,
      path: r.path,
      pathStr: joinPath(r.path),
      type: r.type,
      value: serializeValue(r.value),
    }));
    return { total, sample, truncated: total > cap };
  }

  function joinPath(path) {
    let s = "window";
    for (const k of path) {
      if (/^[A-Za-z_$][\w$]*$/.test(k)) s += "." + k;
      else s += "[" + JSON.stringify(k) + "]";
    }
    return s;
  }

  function refreshResults() {
    const cap = 1000;
    const sample = lastResults.slice(0, cap).map((r) => {
      const cur = resolveByPath(r.path);
      return {
        id: r.id,
        path: r.path,
        pathStr: joinPath(r.path),
        type: r.type,
        value: serializeValue(cur),
      };
    });
    return { total: lastResults.length, sample, truncated: lastResults.length > cap };
  }

  // ---- Message dispatcher ---------------------------------------------------

  function handle(payload) {
    const cmd = payload && payload.cmd;
    try {
      switch (cmd) {
        case "ping":
          return { ok: true, pong: true };
        case "getInfo":
          return {
            ok: true,
            url: (function () {
              try { return location.href; } catch (e) { return ""; }
            })(),
            title: (function () {
              try { return document.title || ""; } catch (e) { return ""; }
            })(),
            isTop: window.top === window,
          };
        case "firstScan":
          return { ok: true, ...firstScan(payload) };
        case "nextScan":
          return { ok: true, ...nextScan(payload) };
        case "newScan":
          lastResults = [];
          unknownSnapshot = null;
          return { ok: true, total: 0, sample: [], truncated: false };
        case "refresh":
          return { ok: true, ...refreshResults() };
        case "read":
          return { ok: true, ...readByPath(payload.path) };
        case "write":
          return writeByPath(payload.path, payload.type, payload.value);
        case "freezeAdd":
          return freezeAdd(payload);
        case "freezeRemove":
          return freezeRemove(payload);
        case "freezeUpdate":
          return freezeUpdate(payload);
        case "freezeList":
          return { ok: true, list: getFreezeList() };
        default:
          return { ok: false, error: "Unknown command: " + cmd };
      }
    } catch (e) {
      return { ok: false, error: String((e && e.message) || e) };
    }
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || data.source !== SOURCE_EXT) return;
    const reply = handle(data.payload);
    window.postMessage(
      { source: SOURCE_PAGE, requestId: data.requestId, payload: reply },
      "*"
    );
  });
})();
