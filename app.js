(() => {
  const { useState, useRef, useEffect, useCallback, useMemo } = React;
  const _sb = window.supabase.createClient(
    "https://vfzbrnhakjefokunwjmg.supabase.co",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZmemJybmhha2plZm9rdW53am1nIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkwMTc1MjUsImV4cCI6MjA5NDU5MzUyNX0.uvu3_kXh9_M0mpzaG2aK8ID36QAHBjiQc6qnVPuqD2I"
  );
  const rawUser = new URLSearchParams(window.location.search).get("user") || "main";
  const urlUser = rawUser.replace(/[^a-zA-Z0-9_]/g, "").slice(0, 32) || "main";
  const DB_ROW_ID = `user_${urlUser}`;
  const THREE_DAYS = 3 * 24 * 60 * 60 * 1e3;
  async function hashPassword(pw) {
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      enc.encode(pw),
      "PBKDF2",
      false,
      ["deriveBits"]
    );
    const buf = await crypto.subtle.deriveBits(
      { name: "PBKDF2", salt: enc.encode(urlUser + "taskboard_salt_2024"), iterations: 1e5, hash: "SHA-256" },
      keyMaterial,
      256
    );
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  async function loadState(dateCols) {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    try {
      const { data, error } = await _sb.from("todos").select("data, password_hash").eq("id", DB_ROW_ID).single();
      if (error) {
        if (error.code === "PGRST116") return null;
        console.error("loadState DB error:", error);
        return { loadError: true };
      }
      if (!data) return null;
      const s = (_a = data == null ? void 0 : data.data) != null ? _a : {};
      const now = Date.now();
      return {
        inbox: (_b = s.inbox) != null ? _b : [],
        amCols: dateCols.map((d) => {
          var _a2, _b2;
          return (_b2 = (_a2 = s.amByDate) == null ? void 0 : _a2[d.toDateString()]) != null ? _b2 : [];
        }),
        pmCols: dateCols.map((d) => {
          var _a2, _b2;
          return (_b2 = (_a2 = s.pmByDate) == null ? void 0 : _a2[d.toDateString()]) != null ? _b2 : [];
        }),
        amByDate: (_c = s.amByDate) != null ? _c : {},
        pmByDate: (_d = s.pmByDate) != null ? _d : {},
        doneIds: new Set((_e = s.doneIds) != null ? _e : []),
        routines: (_f = s.routines) != null ? _f : [],
        trash: ((_g = s.trash) != null ? _g : []).filter((t) => now - t.deletedAt < THREE_DAYS),
        passwordHash: (_h = data.password_hash) != null ? _h : null
      };
    } catch (e) {
      console.error("loadState exception:", e);
      return { loadError: true };
    }
  }
  let _saveTimer = null;
  let _saveChain = Promise.resolve();
  let _saveVersion = 0;
  function saveState(state, dateCols, onError, onSuccess) {
    const version = ++_saveVersion;
    clearTimeout(_saveTimer);
    _saveTimer = setTimeout(() => {
      _saveChain = _saveChain.then(async () => {
        var _a, _b, _c;
        try {
          const amByDate = { ...(_a = state.amByDate) != null ? _a : {} };
          const pmByDate = { ...(_b = state.pmByDate) != null ? _b : {} };
          dateCols.forEach((d, i) => {
            amByDate[d.toDateString()] = state.amCols[i];
            pmByDate[d.toDateString()] = state.pmCols[i];
          });
          if (state.extraWeeks) {
            state.extraWeeks.forEach(({ cols, am, pm }) => {
              cols.forEach((d, i) => {
                amByDate[d.toDateString()] = am[i];
                pmByDate[d.toDateString()] = pm[i];
              });
            });
          }
          const { error } = await _sb.from("todos").upsert({
            id: DB_ROW_ID,
            password_hash: (_c = state.passwordHash) != null ? _c : null,
            data: { inbox: state.inbox, amByDate, pmByDate, doneIds: [...state.doneIds], routines: state.routines, trash: state.trash, savedAt: Date.now() },
            updated_at: (/* @__PURE__ */ new Date()).toISOString()
          });
          if (error) throw error;
          if (version === _saveVersion) onSuccess == null ? void 0 : onSuccess();
        } catch (e) {
          console.error("save error", e);
          if (version === _saveVersion) onError == null ? void 0 : onError();
        }
      });
    }, 800);
  }
  const PINK = "#d4457a";
  const PINK_LIGHT = "#fce8f1";
  const PINK_TEXT = "#b03468";
  const AM_BG = "#f2faf2";
  const AM_BORDER = "#8ed08e";
  const AM_ACCENT = "#3a9e3a";
  const AM_LIGHT = "#e4f5e4";
  const AM_TEXT = "#2a6e2a";
  const AM_HEAD = "#2e8c2e";
  const PM_BG = "#fff6ee";
  const PM_BORDER = "#f5a55a";
  const PM_ACCENT = "#e06010";
  const PM_LIGHT = "#feebd8";
  const PM_TEXT = "#a04010";
  const PM_HEAD = "#d05c10";
  const FONT_STYLE = { fontFamily: "'Noto Sans JP', 'Hiragino Sans', sans-serif" };
  const DAYS_JP = ["日", "月", "火", "水", "木", "金", "土"];
  function getWeekDateCols(weekOffset) {
    const t = /* @__PURE__ */ new Date();
    t.setHours(0, 0, 0, 0);
    const dow = t.getDay();
    const monday = new Date(t);
    monday.setDate(t.getDate() - (dow + 6) % 7 + weekOffset * 7);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      return d;
    });
  }
  function getTodayColIndex(dateCols) {
    const today = /* @__PURE__ */ new Date();
    today.setHours(0, 0, 0, 0);
    return dateCols.findIndex((d) => d.toDateString() === today.toDateString());
  }
  function fmtDate(d) {
    return `${d.getMonth() + 1}/${d.getDate()}`;
  }
  function getDayLabel(i, date) {
    if (!date) {
      return i === 0 ? "今日" : i === 1 ? "明日" : i === 2 ? "明後日" : `${i}日後`;
    }
    const t = /* @__PURE__ */ new Date();
    t.setHours(0, 0, 0, 0);
    const diff = Math.round((date - t) / 864e5);
    if (diff === 0) return "今日";
    if (diff === 1) return "明日";
    if (diff === 2) return "明後日";
    if (diff === -1) return "昨日";
    if (diff < 0) return `${-diff}日前`;
    return fmtDate(date);
  }
  function genId() {
    return typeof crypto.randomUUID === "function" ? crypto.randomUUID() : ("10000000-1000-4000-8000" + -1e11).replace(/[018]/g, (c) => (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16));
  }
  function stampTodo(t) {
    return { createdAt: Date.now(), lastCheckedAt: null, ...t };
  }
  function routineLabel(r) {
    if (!r) return null;
    if (r.type === "daily") return "毎日";
    if (r.type === "weekly") return "毎週 " + r.days.map((d) => DAYS_JP[d]).join("・");
    if (r.type === "nweekly") return `${r.interval}週に1回`;
    if (r.type === "ndaily") return `${r.interval}日毎`;
    if (r.type === "monthly") return `毎月 ${r.day}日`;
    if (r.type === "date") return `${r.month}/${r.day}`;
    return null;
  }
  const DAY_MAP = { "日曜日": 0, "日曜": 0, "月曜日": 1, "月曜": 1, "火曜日": 2, "火曜": 2, "水曜日": 3, "水曜": 3, "木曜日": 4, "木曜": 4, "金曜日": 5, "金曜": 5, "土曜日": 6, "土曜": 6, "日": 0, "月": 1, "火": 2, "水": 3, "木": 4, "金": 5, "土": 6 };
  const DAY_MAP_KEYS = Object.keys(DAY_MAP).sort((a, b) => b.length - a.length);
  function extractDays(str) {
    const days = [];
    let rem = str;
    while (rem.length > 0) {
      const k = DAY_MAP_KEYS.find((k2) => rem.startsWith(k2));
      if (k) {
        if (!days.includes(DAY_MAP[k])) days.push(DAY_MAP[k]);
        rem = rem.slice(k.length).replace(/^[・,、\s]+/, "");
      } else rem = rem.slice(1);
    }
    return days;
  }
  function parseLine(raw) {
    try {
      let line = raw.trim();
      if (!line) return null;
      let routine = null, slotHint = null;
      if (/^(AM|午前)\s*/i.test(line)) {
        slotHint = "am";
        line = line.replace(/^(AM|午前)\s*/i, "");
      } else if (/^(PM|午後)\s*/i.test(line)) {
        slotHint = "pm";
        line = line.replace(/^(PM|午後)\s*/i, "");
      }
      if (/(今日|本日)/.test(line)) {
        routine = { type: "relative", offset: 0 };
        line = line.replace(/(今日|本日)/g, "");
      } else if (/明後々日|明々後日/.test(line)) {
        routine = { type: "relative", offset: 3 };
        line = line.replace(/明後々日|明々後日/g, "");
      } else if (/明後日/.test(line)) {
        routine = { type: "relative", offset: 2 };
        line = line.replace(/明後日/g, "");
      } else if (/明日/.test(line)) {
        routine = { type: "relative", offset: 1 };
        line = line.replace(/明日/g, "");
      }
      if (!routine && /毎日/.test(line)) {
        routine = { type: "daily" };
        line = line.replace(/毎日/g, "");
      }
      if (!routine) {
        const m = line.match(/毎月\s*(\d{1,2})\s*日?/);
        if (m) {
          routine = { type: "monthly", day: +m[1] };
          line = line.replace(m[0], "");
        }
      }
      if (!routine) {
        const m = line.match(/(\d{1,2})[\/\-](\d{1,2})/) || line.match(/(\d{1,2})月(\d{1,2})日/);
        if (m) {
          routine = { type: "date", month: +m[1], day: +m[2] };
          line = line.replace(m[0], "");
        }
      }
      if (!routine) {
        const m = line.match(/([0-9０-９]+)\s*日(?:毎|ごと)/);
        if (m) {
          const n = parseInt(m[1].replace(/[０-９]/g, (s) => String.fromCharCode(s.charCodeAt(0) - 65248)));
          if (n >= 2) {
            routine = { type: "ndaily", interval: n, startDate: (/* @__PURE__ */ new Date()).toDateString() };
            line = line.replace(m[0], "");
          }
        }
      }
      if (!routine) {
        const m = line.match(/([2-9２-９]|[1１][0-9０-９]?)\s*週/);
        if (m) {
          const n = parseInt(m[1].replace(/[０-９]/g, (s) => String.fromCharCode(s.charCodeAt(0) - 65248)));
          routine = { type: "nweekly", interval: n, startDate: (/* @__PURE__ */ new Date()).toDateString() };
          line = line.replace(m[0], "");
        }
      }
      if (!routine) {
        const m = line.match(/毎週\s*([^\s,、。\d]+)/);
        if (m) {
          const d = extractDays(m[1]);
          if (d.length) {
            routine = { type: "weekly", days: d.sort() };
            line = line.replace(m[0], "");
          }
        }
      }
      if (!routine) {
        const m = line.match(/毎([月火水木金土日][曜日]?(?:[・,、]?[月火水木金土日][曜日]?)*)/);
        if (m) {
          const d = extractDays(m[1]);
          if (d.length) {
            routine = { type: "weekly", days: d.sort() };
            line = line.replace(m[0], "");
          }
        }
      }
      if (!slotHint) {
        if (/(^|\s)(AM|午前)(\s|$)/i.test(line)) {
          slotHint = "am";
          line = line.replace(/(^|\s)(AM|午前)(\s|$)/ig, " ");
        } else if (/(^|\s)(PM|午後)(\s|$)/i.test(line)) {
          slotHint = "pm";
          line = line.replace(/(^|\s)(PM|午後)(\s|$)/ig, " ");
        }
      }
      line = line.replace(/[,、。・]+/g, " ").replace(/\s+/g, " ").trim();
      if (!line) return null;
      return { text: line, routine, slotHint };
    } catch (e) {
      console.warn("parseLine error:", e, raw);
      const text = raw.trim();
      return text ? { text, routine: null, slotHint: null } : null;
    }
  }
  function previewLines(raw) {
    return raw.split("\n").map((l) => ({ original: l, parsed: parseLine(l) }));
  }
  function resolveColIds(todo, dateCols) {
    const r = todo.routine;
    if (!r) return null;
    const slot = todo.slotHint === "pm" ? "pm" : "am";
    if (r.type === "relative") {
      const i = r.offset;
      return i >= 0 && i < dateCols.length ? [`d${i}-${slot}`] : null;
    }
    if (r.type === "daily") return dateCols.map((_, i) => `d${i}-${slot}`);
    if (r.type === "weekly") {
      const c = [];
      for (let i = 0; i < dateCols.length; i++) if (r.days.includes(dateCols[i].getDay())) c.push(`d${i}-${slot}`);
      return c.length ? c : null;
    }
    if (r.type === "nweekly") {
      const start = new Date(r.startDate);
      start.setHours(0, 0, 0, 0);
      const monday = new Date(dateCols[0]);
      monday.setHours(0, 0, 0, 0);
      const diffWeeks = Math.round((monday - start) / (7 * 24 * 60 * 60 * 1e3));
      if (diffWeeks >= 0 && diffWeeks % r.interval === 0) {
        const dow = start.getDay();
        const colIdx = dateCols.findIndex((d) => d.getDay() === dow);
        const idx = colIdx >= 0 ? colIdx : 0;
        return [`d${idx}-${slot}`];
      }
      return null;
    }
    if (r.type === "ndaily") {
      const start = new Date(r.startDate);
      start.setHours(0, 0, 0, 0);
      const cols = [];
      for (let i = 0; i < dateCols.length; i++) {
        const diff = Math.round((dateCols[i] - start) / (24 * 60 * 60 * 1e3));
        if (diff >= 0 && diff % r.interval === 0) cols.push(`d${i}-${slot}`);
      }
      return cols.length ? cols : null;
    }
    if (r.type === "monthly") {
      for (let i = 0; i < dateCols.length; i++) if (dateCols[i].getDate() === r.day) return [`d${i}-${slot}`];
      return null;
    }
    if (r.type === "date") {
      for (let i = 0; i < dateCols.length; i++) if (dateCols[i].getMonth() + 1 === r.month && dateCols[i].getDate() === r.day) return [`d${i}-${slot}`];
      return null;
    }
    return null;
  }
  function autoGenerateFromDefinitions(amCols, pmCols, routines, dateCols) {
    if (!routines.length) return { amCols, pmCols };
    const today = /* @__PURE__ */ new Date();
    today.setHours(0, 0, 0, 0);
    const newAm = amCols.map((c) => [...c]), newPm = pmCols.map((c) => [...c]);
    routines.forEach((def) => {
      if (!def.active) return;
      if (def.expiresAt) {
        const exp = new Date(def.expiresAt);
        exp.setHours(23, 59, 59, 999);
        if (today > exp) return;
      }
      const colIds = resolveColIds(def, dateCols);
      if (!colIds) return;
      colIds.forEach((colId) => {
        const m = colId.match(/^d(\d+)-(am|pm)$/);
        if (!m) return;
        const di = +m[1], isAm = m[2] === "am";
        const col = isAm ? newAm[di] : newPm[di];
        if (col.some((t) => t.routineDefId === def.id)) return;
        const task = stampTodo({
          id: genId(),
          text: def.text,
          routine: def.routine,
          slotHint: def.slotHint,
          routineDefId: def.id,
          lastCheckedAt: null,
          createdAt: Date.now()
        });
        if (isAm) newAm[di] = [...newAm[di], task];
        else newPm[di] = [...newPm[di], task];
      });
    });
    return { amCols: newAm, pmCols: newPm };
  }
  function syncRoutineDefinition(amCols, pmCols, def, dateCols) {
    var _a;
    const existingByCol = /* @__PURE__ */ new Map(), oldIds = /* @__PURE__ */ new Set();
    amCols.forEach((col, i) => col.forEach((t) => {
      if (t.routineDefId === def.id) {
        existingByCol.set(`d${i}-am`, t);
        oldIds.add(t.id);
      }
    }));
    pmCols.forEach((col, i) => col.forEach((t) => {
      if (t.routineDefId === def.id) {
        existingByCol.set(`d${i}-pm`, t);
        oldIds.add(t.id);
      }
    }));
    const newAm = amCols.map((col) => col.filter((t) => t.routineDefId !== def.id));
    const newPm = pmCols.map((col) => col.filter((t) => t.routineDefId !== def.id));
    const today = /* @__PURE__ */ new Date();
    today.setHours(0, 0, 0, 0);
    const expired = def.expiresAt && /* @__PURE__ */ new Date(`${def.expiresAt}T23:59:59`) < today;
    const colIds = def.active && !expired ? (_a = resolveColIds(def, dateCols)) != null ? _a : [] : [];
    const keptIds = /* @__PURE__ */ new Set();
    colIds.forEach((colId) => {
      const m = colId.match(/^d(\d+)-(am|pm)$/);
      if (!m) return;
      const di = +m[1], isAm = m[2] === "am", existing = existingByCol.get(colId);
      const task = existing ? { ...existing, text: def.text, routine: def.routine, slotHint: def.slotHint, routineDefId: def.id } : stampTodo({ id: genId(), text: def.text, routine: def.routine, slotHint: def.slotHint, routineDefId: def.id });
      keptIds.add(task.id);
      if (isAm) newAm[di] = [...newAm[di], task];
      else newPm[di] = [...newPm[di], task];
    });
    return { amCols: newAm, pmCols: newPm, removedIds: [...oldIds].filter((id) => !keptIds.has(id)) };
  }
  function useSortDrag({ onReorder }) {
    const drag = useRef(null), ghost = useRef(null), overIdx = useRef(null), timer = useRef(null), start = useRef(null), active = useRef(false);
    const cleanup = useCallback(() => {
      var _a;
      clearTimeout(timer.current);
      (_a = ghost.current) == null ? void 0 : _a.remove();
      ghost.current = null;
      drag.current = null;
      active.current = false;
      overIdx.current = null;
      document.body.style.overflow = "";
      document.querySelectorAll("[data-sort-over]").forEach((el) => el.removeAttribute("data-sort-over"));
    }, []);
    const onDragStart = useCallback((e, colId, idx) => {
      drag.current = { colId, idx };
      e.dataTransfer.effectAllowed = "move";
    }, []);
    const onDragOver = useCallback((e, colId, idx) => {
      e.preventDefault();
      if (!drag.current || drag.current.colId !== colId) return;
      overIdx.current = idx;
      document.querySelectorAll("[data-sort-over]").forEach((el) => el.removeAttribute("data-sort-over"));
      e.currentTarget.setAttribute("data-sort-over", "true");
    }, []);
    const onDragEnd = useCallback(() => {
      if (drag.current && overIdx.current !== null && overIdx.current !== drag.current.idx)
        onReorder(drag.current.colId, drag.current.idx, overIdx.current);
      cleanup();
    }, [onReorder, cleanup]);
    const spawnGhost = useCallback((el, cx, cy) => {
      const r = el.getBoundingClientRect(), clone = el.cloneNode(true);
      clone.style.cssText = `position:fixed;left:${r.left}px;top:${r.top}px;width:${r.width}px;opacity:.82;pointer-events:none;z-index:9999;border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.2);transform:scale(1.03);margin:0`;
      document.body.appendChild(clone);
      ghost.current = { el: clone, offsetX: cx - r.left, offsetY: cy - r.top };
    }, []);
    const onTouchStart = useCallback((e, colId, idx, cardEl) => {
      const t = e.touches[0];
      start.current = { x: t.clientX, y: t.clientY };
      drag.current = { colId, idx, srcEl: cardEl };
      timer.current = setTimeout(() => {
        if (!drag.current) return;
        active.current = true;
        document.body.style.overflow = "hidden";
        spawnGhost(drag.current.srcEl, start.current.x, start.current.y);
      }, 280);
    }, [spawnGhost]);
    const onTouchMove = useCallback((e) => {
      if (!drag.current) return;
      const t = e.touches[0];
      if (!active.current) {
        const dx = t.clientX - start.current.x, dy = t.clientY - start.current.y;
        if (Math.sqrt(dx * dx + dy * dy) > 8) {
          cleanup();
          return;
        }
        return;
      }
      if (e.cancelable) e.preventDefault();
      e.stopPropagation();
      if (ghost.current) {
        ghost.current.el.style.left = `${t.clientX - ghost.current.offsetX}px`;
        ghost.current.el.style.top = `${t.clientY - ghost.current.offsetY}px`;
      }
      ghost.current.el.style.visibility = "hidden";
      const el = document.elementFromPoint(t.clientX, t.clientY);
      ghost.current.el.style.visibility = "";
      const card = el == null ? void 0 : el.closest("[data-sort-idx]");
      document.querySelectorAll("[data-sort-over]").forEach((el2) => el2.removeAttribute("data-sort-over"));
      if (card) {
        const colEl = card.closest("[data-colid]");
        if (colEl && colEl.dataset.colid !== drag.current.colId) {
          overIdx.current = null;
          return;
        }
        overIdx.current = +card.dataset.sortIdx;
        card.setAttribute("data-sort-over", "true");
      }
    }, [cleanup]);
    const onTouchEnd = useCallback(() => {
      clearTimeout(timer.current);
      if (!active.current || !drag.current) {
        cleanup();
        return;
      }
      if (overIdx.current !== null && overIdx.current !== drag.current.idx)
        onReorder(drag.current.colId, drag.current.idx, overIdx.current);
      cleanup();
    }, [onReorder, cleanup]);
    return { onDragStart, onDragOver, onDragEnd, onTouchStart, onTouchMove, onTouchEnd };
  }
  function LockScreen({ isNew, onAuth, error }) {
    const [pw, setPw] = useState(""), [pw2, setPw2] = useState(""), [show, setShow] = useState(false);
    const submit = () => onAuth(pw, pw2);
    return /* @__PURE__ */ React.createElement("div", { style: { minHeight: "100vh", background: "#f5f6f8", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, ...FONT_STYLE } }, /* @__PURE__ */ React.createElement("div", { style: { background: "#fff", borderRadius: 20, padding: "36px 28px", width: "100%", maxWidth: 360, boxShadow: "0 4px 24px rgba(0,0,0,.08)" } }, /* @__PURE__ */ React.createElement("div", { style: { textAlign: "center", marginBottom: 28 } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 36, marginBottom: 10 } }, "🔐"), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 18, fontWeight: 700, color: "#0d0d0d", marginBottom: 6 } }, isNew ? "パスワードを設定" : "Task Board"), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 12, color: "#aaa" } }, isNew ? `${urlUser} の初回設定` : `${urlUser} のボード`)), /* @__PURE__ */ React.createElement("div", { style: { marginBottom: 14 } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, fontWeight: 700, color: "#aaa", marginBottom: 6 } }, isNew ? "新しいパスワード" : "パスワード"), /* @__PURE__ */ React.createElement("div", { style: { position: "relative" } }, /* @__PURE__ */ React.createElement(
      "input",
      {
        type: show ? "text" : "password",
        value: pw,
        onChange: (e) => setPw(e.target.value),
        onKeyDown: (e) => e.key === "Enter" && submit(),
        autoFocus: true,
        placeholder: "パスワードを入力",
        style: { width: "100%", padding: "12px 44px 12px 14px", fontSize: 15, border: "1.5px solid #e0e0e0", borderRadius: 10, outline: "none", boxSizing: "border-box", ...FONT_STYLE }
      }
    ), /* @__PURE__ */ React.createElement("button", { onClick: () => setShow((p) => !p), style: { position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", fontSize: 16, color: "#aaa" } }, show ? "🙈" : "👁"))), isNew && /* @__PURE__ */ React.createElement("div", { style: { marginBottom: 14 } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, fontWeight: 700, color: "#aaa", marginBottom: 6 } }, "パスワード（確認）"), /* @__PURE__ */ React.createElement(
      "input",
      {
        type: show ? "text" : "password",
        value: pw2,
        onChange: (e) => setPw2(e.target.value),
        onKeyDown: (e) => e.key === "Enter" && submit(),
        placeholder: "もう一度入力",
        style: { width: "100%", padding: "12px 14px", fontSize: 15, border: "1.5px solid #e0e0e0", borderRadius: 10, outline: "none", boxSizing: "border-box", ...FONT_STYLE }
      }
    )), error && /* @__PURE__ */ React.createElement("div", { style: { fontSize: 12, color: "#cc3333", marginBottom: 12, textAlign: "center" } }, error), /* @__PURE__ */ React.createElement("button", { onClick: submit, style: { width: "100%", padding: 13, background: "#0d0d0d", color: "#fff", fontWeight: 700, fontSize: 15, borderRadius: 10, border: "none", cursor: "pointer", ...FONT_STYLE } }, isNew ? "設定して始める" : "ログイン")));
  }
  function EditModal({ todo, onSave, onClose }) {
    var _a, _b, _c, _d, _e;
    const [text, setText] = useState((todo == null ? void 0 : todo.text) || "");
    const [rtype, setRtype] = useState(((_a = todo == null ? void 0 : todo.routine) == null ? void 0 : _a.type) || "none");
    const [wdays, setWdays] = useState(((_b = todo == null ? void 0 : todo.routine) == null ? void 0 : _b.days) || []);
    const [mday, setMday] = useState(((_c = todo == null ? void 0 : todo.routine) == null ? void 0 : _c.day) || 1);
    const [dm, setDm] = useState(((_d = todo == null ? void 0 : todo.routine) == null ? void 0 : _d.month) || (/* @__PURE__ */ new Date()).getMonth() + 1);
    const [dd, setDd] = useState(((_e = todo == null ? void 0 : todo.routine) == null ? void 0 : _e.day) || (/* @__PURE__ */ new Date()).getDate());
    const [slotHint, setSlotHint] = useState((todo == null ? void 0 : todo.slotHint) || "am");
    const [important, setImportant] = useState(!!(todo == null ? void 0 : todo.important));
    const togDay = (d) => setWdays((p) => p.includes(d) ? p.filter((x) => x !== d) : [...p, d].sort());
    const KNOWN_RTYPES = ["none", "daily", "weekly", "monthly", "date"];
    const save = () => {
      var _a2;
      if (!text.trim()) return;
      let routine = null;
      if (rtype === "daily") routine = { type: "daily" };
      else if (rtype === "weekly") routine = { type: "weekly", days: wdays };
      else if (rtype === "monthly") routine = { type: "monthly", day: mday };
      else if (rtype === "date") routine = { type: "date", month: dm, day: dd };
      else if (rtype !== "none") routine = (_a2 = todo == null ? void 0 : todo.routine) != null ? _a2 : null;
      onSave({ ...todo, text: text.trim(), routine, slotHint: rtype === "none" ? null : slotHint, important });
    };
    const IMP_RED = "#E24B4A";
    const inp = { ...FONT_STYLE, background: "#f7f7f7", border: "1.5px solid #e0e0e0", borderRadius: 6, color: "#111", padding: "8px 10px", fontSize: 14, outline: "none", textAlign: "center" };
    const btn = (active) => ({ ...FONT_STYLE, padding: "7px 16px", borderRadius: 6, fontSize: 13, cursor: "pointer", fontWeight: 700, background: active ? "#0d0d0d" : "#f5f5f5", border: `1.5px solid ${active ? "#0d0d0d" : "#ddd"}`, color: active ? "#fff" : "#555" });
    return /* @__PURE__ */ React.createElement("div", { style: { position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 2e3 }, onClick: onClose }, /* @__PURE__ */ React.createElement("div", { style: { ...FONT_STYLE, background: "#fff", borderRadius: "20px 20px 0 0", padding: "24px 20px 40px", width: "100%", maxWidth: 520, boxShadow: "0 -4px 24px rgba(0,0,0,.12)" }, onClick: (e) => e.stopPropagation() }, /* @__PURE__ */ React.createElement("div", { style: { width: 40, height: 4, background: "#ddd", borderRadius: 2, margin: "0 auto 20px" } }), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 12, fontWeight: 700, color: PINK, marginBottom: 14 } }, (todo == null ? void 0 : todo.id) ? "タスクを編集" : "新しいタスク"), /* @__PURE__ */ React.createElement(
      "textarea",
      {
        value: text,
        onChange: (e) => setText(e.target.value),
        autoFocus: true,
        placeholder: "タスクの内容...",
        style: { ...FONT_STYLE, width: "100%", background: "#f7f7f7", border: "1.5px solid #e0e0e0", borderRadius: 8, color: "#111", padding: "12px 14px", fontSize: 16, resize: "none", minHeight: 70, outline: "none", boxSizing: "border-box" }
      }
    ), /* @__PURE__ */ React.createElement(
      "div",
      {
        onClick: () => setImportant((p) => !p),
        style: { marginTop: 14, display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 10, cursor: "pointer", background: important ? "#FCEBEB" : "#f7f7f7", border: `1.5px solid ${important ? IMP_RED : "#e0e0e0"}`, transition: "all .15s" }
      },
      /* @__PURE__ */ React.createElement("div", { style: { width: 36, height: 20, borderRadius: 10, background: important ? IMP_RED : "#ddd", position: "relative", transition: "background .2s", flexShrink: 0 } }, /* @__PURE__ */ React.createElement("div", { style: { position: "absolute", top: 2, left: important ? 18 : 2, width: 16, height: 16, borderRadius: "50%", background: "#fff", transition: "left .2s" } })),
      /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { style: { ...FONT_STYLE, fontSize: 13, fontWeight: 700, color: important ? IMP_RED : "#555" } }, "‼️ 重要タスク"), /* @__PURE__ */ React.createElement("div", { style: { ...FONT_STYLE, fontSize: 11, color: "#aaa", marginTop: 1 } }, "ONにすると赤枠で強調・先頭に表示"))
    ), /* @__PURE__ */ React.createElement("div", { style: { marginTop: 16 } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, fontWeight: 700, color: "#aaa", marginBottom: 10 } }, "ルーティン設定"), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 8, flexWrap: "wrap" } }, [["none", "なし"], ["daily", "毎日"], ["weekly", "毎週"], ["monthly", "毎月"], ["date", "日付指定"]].map(([v, l]) => /* @__PURE__ */ React.createElement("button", { key: v, onClick: () => setRtype(v), style: btn(rtype === v) }, l)), !KNOWN_RTYPES.includes(rtype) && /* @__PURE__ */ React.createElement("button", { style: { ...btn(true), cursor: "default" } }, "🔁 ", routineLabel(todo == null ? void 0 : todo.routine) || "カスタム")), !KNOWN_RTYPES.includes(rtype) && /* @__PURE__ */ React.createElement("div", { style: { ...FONT_STYLE, fontSize: 11, color: "#aaa", marginTop: 8 } }, "この繰り返し設定はクイック入力で作成されたものです。保存しても設定は維持されます。"), rtype === "weekly" && /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" } }, DAYS_JP.map((d, i) => /* @__PURE__ */ React.createElement("button", { key: i, onClick: () => togDay(i), style: { ...FONT_STYLE, width: 40, height: 40, borderRadius: 8, fontSize: 14, cursor: "pointer", fontWeight: 700, background: wdays.includes(i) ? "#0d0d0d" : "#f5f5f5", border: `1.5px solid ${wdays.includes(i) ? "#0d0d0d" : "#ddd"}`, color: wdays.includes(i) ? "#fff" : i === 0 ? "#e03030" : i === 6 ? PINK : "#444" } }, d))), rtype === "monthly" && /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 10, marginTop: 14 } }, /* @__PURE__ */ React.createElement("span", { style: { fontSize: 16, color: "#666" } }, "毎月"), /* @__PURE__ */ React.createElement("input", { type: "number", min: "1", max: "31", value: mday, onChange: (e) => setMday(+e.target.value), style: { ...inp, width: 64 } }), /* @__PURE__ */ React.createElement("span", { style: { fontSize: 16, color: "#666" } }, "日")), rtype === "date" && /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, marginTop: 14 } }, /* @__PURE__ */ React.createElement("input", { type: "number", min: "1", max: "12", value: dm, onChange: (e) => setDm(+e.target.value), style: { ...inp, width: 58 } }), /* @__PURE__ */ React.createElement("span", { style: { fontSize: 16, color: "#666" } }, "月"), /* @__PURE__ */ React.createElement("input", { type: "number", min: "1", max: "31", value: dd, onChange: (e) => setDd(+e.target.value), style: { ...inp, width: 58 } }), /* @__PURE__ */ React.createElement("span", { style: { fontSize: 16, color: "#666" } }, "日")), rtype !== "none" && /* @__PURE__ */ React.createElement("div", { style: { marginTop: 14 } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, fontWeight: 700, color: "#aaa", marginBottom: 8 } }, "時間帯"), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 8 } }, /* @__PURE__ */ React.createElement("button", { onClick: () => setSlotHint("am"), style: { ...btn(slotHint === "am"), color: slotHint === "am" ? "#fff" : AM_TEXT, background: slotHint === "am" ? AM_ACCENT : "#f5f5f5", borderColor: slotHint === "am" ? AM_ACCENT : "#ddd" } }, "🌱 AM"), /* @__PURE__ */ React.createElement("button", { onClick: () => setSlotHint("pm"), style: { ...btn(slotHint === "pm"), color: slotHint === "pm" ? "#fff" : PM_TEXT, background: slotHint === "pm" ? PM_ACCENT : "#f5f5f5", borderColor: slotHint === "pm" ? PM_ACCENT : "#ddd" } }, "☀️ PM")))), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 10, marginTop: 24 } }, /* @__PURE__ */ React.createElement("button", { onClick: onClose, style: { ...FONT_STYLE, flex: 1, padding: 12, borderRadius: 8, fontSize: 14, fontWeight: 700, background: "#f5f5f5", border: "1.5px solid #e0e0e0", color: "#666", cursor: "pointer" } }, "キャンセル"), /* @__PURE__ */ React.createElement("button", { onClick: save, style: { ...FONT_STYLE, flex: 2, padding: 12, borderRadius: 8, fontSize: 14, fontWeight: 700, background: "#0d0d0d", border: "none", color: "#fff", cursor: "pointer" } }, "保存"))));
  }
  function TodoCard({ todo, isDone, isAm, sortIdx, colId, onEdit, onDelete, onToggle, sortDrag }) {
    const cardRef = useRef(null);
    const imp = !!todo.important;
    const IMP_RED = "#E24B4A", IMP_RED_TEXT = "#791F1F";
    const ac = isAm ? AM_ACCENT : PM_ACCENT, cb = isAm ? AM_LIGHT : PM_LIGHT, ct = isAm ? AM_TEXT : PM_TEXT;
    const lbl = routineLabel(todo.routine);
    const borderCol = isDone ? "#eee" : imp ? IMP_RED : isAm ? "#f0d8b0" : "#d4c8f0";
    const borderW = imp && !isDone ? "3px" : "1.5px";
    return /* @__PURE__ */ React.createElement(
      "div",
      {
        ref: cardRef,
        "data-sort-idx": sortIdx,
        draggable: true,
        onDragStart: (e) => sortDrag.onDragStart(e, colId, sortIdx),
        onDragOver: (e) => sortDrag.onDragOver(e, colId, sortIdx),
        onDragEnd: sortDrag.onDragEnd,
        onTouchStart: (e) => sortDrag.onTouchStart(e, colId, sortIdx, cardRef.current),
        onTouchMove: sortDrag.onTouchMove,
        onTouchEnd: sortDrag.onTouchEnd,
        style: { ...FONT_STYLE, background: isDone ? "#fafafa" : "#fff", border: `${borderW} solid ${borderCol}`, borderRadius: 10, padding: "10px 10px 10px 4px", marginBottom: 7, userSelect: "none", WebkitUserSelect: "none", WebkitTouchCallout: "none", opacity: isDone ? 0.55 : 1, touchAction: "pan-y", transition: "border-color .15s" }
      },
      /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "flex-start", gap: 6 } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 3, padding: "3px 4px", cursor: "grab", flexShrink: 0, marginTop: 2 } }, [0, 1, 2].map((i) => /* @__PURE__ */ React.createElement("div", { key: i, style: { display: "flex", gap: 2 } }, [0, 1].map((j) => /* @__PURE__ */ React.createElement("div", { key: j, style: { width: 3, height: 3, borderRadius: "50%", background: imp && !isDone ? "#F09595" : "#ccc" } }))))), /* @__PURE__ */ React.createElement("div", { onClick: () => onToggle(todo.id), style: { width: 17, height: 17, minWidth: 17, borderRadius: 4, marginTop: 2, border: `2px solid ${isDone ? ac : imp ? "#F09595" : "#ccc"}`, background: isDone ? ac : "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 } }, isDone && /* @__PURE__ */ React.createElement("span", { style: { color: "#fff", fontSize: 10, fontWeight: 700, lineHeight: 1 } }, "✓")), /* @__PURE__ */ React.createElement("div", { style: { flex: 1, minWidth: 0 } }, /* @__PURE__ */ React.createElement("div", { style: { ...FONT_STYLE, fontSize: imp && !isDone ? 14 : 13, fontWeight: imp && !isDone ? 700 : 500, color: isDone ? "#aaa" : imp ? IMP_RED_TEXT : "#111", textDecoration: isDone ? "line-through" : "none", lineHeight: 1.5, wordBreak: "break-word" } }, todo.text), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 4, flexWrap: "wrap", marginTop: imp || lbl ? 4 : 0 } }, imp && !isDone && /* @__PURE__ */ React.createElement("span", { style: { ...FONT_STYLE, fontSize: 10, fontWeight: 700, color: IMP_RED_TEXT, background: "#F7C1C1", borderRadius: 99, padding: "2px 8px" } }, "‼️ 重要"), lbl && /* @__PURE__ */ React.createElement("span", { style: { ...FONT_STYLE, fontSize: 10, fontWeight: 700, color: ct, background: cb, borderRadius: 4, padding: "2px 8px" } }, "🔁 ", lbl))), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 2, flexShrink: 0 } }, /* @__PURE__ */ React.createElement("button", { onClick: (e) => {
        e.stopPropagation();
        onEdit(todo);
      }, style: { background: "none", border: "none", color: imp && !isDone ? IMP_RED : "#bbb", cursor: "pointer", padding: "4px 6px", fontSize: 14 } }, "✏️"), /* @__PURE__ */ React.createElement("button", { onClick: (e) => {
        e.stopPropagation();
        onDelete(todo.id);
      }, style: { background: "none", border: "none", color: "#bbb", cursor: "pointer", padding: "4px 6px", fontSize: 14 } }, "🗑")))
    );
  }
  function VolumeBar({ amCount, pmCount }) {
    const total = amCount + pmCount;
    if (!total) return /* @__PURE__ */ React.createElement("div", { style: { height: 6, background: "#f0f0f0", borderRadius: 3, margin: "8px 0 12px" } });
    const ap = Math.round(amCount / total * 100);
    return /* @__PURE__ */ React.createElement("div", { style: { margin: "8px 0 12px" } }, /* @__PURE__ */ React.createElement("div", { style: { height: 6, borderRadius: 3, display: "flex", overflow: "hidden", gap: 2 } }, amCount > 0 && /* @__PURE__ */ React.createElement("div", { style: { flex: amCount, background: AM_ACCENT, borderRadius: 3, transition: "flex .3s" } }), pmCount > 0 && /* @__PURE__ */ React.createElement("div", { style: { flex: pmCount, background: PM_ACCENT, borderRadius: 3, transition: "flex .3s" } })), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", justifyContent: "space-between", marginTop: 3 } }, /* @__PURE__ */ React.createElement("span", { style: { fontSize: 9, fontWeight: 700, color: AM_TEXT } }, "🌱 AM ", amCount, "件 (", ap, "%)"), /* @__PURE__ */ React.createElement("span", { style: { fontSize: 9, fontWeight: 700, color: PM_TEXT } }, "☀️ PM ", pmCount, "件 (", 100 - ap, "%)")));
  }
  function SlotColumn({ colId, isAm, todos, doneIds, onEdit, onDelete, onToggle, onAdd, sortDrag }) {
    const sorted = useMemo(() => [...todos].sort((a, b) => (b.important ? 1 : 0) - (a.important ? 1 : 0)), [todos]);
    return /* @__PURE__ */ React.createElement(
      "div",
      {
        "data-colid": colId,
        style: { ...FONT_STYLE, background: isAm ? AM_BG : PM_BG, border: `1.5px solid ${isAm ? AM_BORDER : PM_BORDER}`, borderRadius: 12, padding: "12px 12px 10px", flex: 1, minWidth: 0 }
      },
      /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, fontWeight: 700, color: isAm ? AM_HEAD : PM_HEAD, marginBottom: 8 } }, isAm ? "🌱 AM" : "☀️ PM"),
      sorted.length === 0 && /* @__PURE__ */ React.createElement("div", { style: { ...FONT_STYLE, fontSize: 11, color: "#ccc", textAlign: "center", padding: "14px 0", fontStyle: "italic" } }, "タスクなし"),
      sorted.map((todo, i) => /* @__PURE__ */ React.createElement(TodoCard, { key: todo.id, todo, sortIdx: i, colId, isDone: doneIds.has(todo.id), isAm, onEdit: (t) => onEdit(t, colId), onDelete, onToggle, sortDrag })),
      /* @__PURE__ */ React.createElement("button", { onClick: () => onAdd(colId), style: { ...FONT_STYLE, marginTop: 6, width: "100%", padding: "6px", background: "transparent", border: `1.5px dashed ${isAm ? AM_BORDER : PM_BORDER}`, borderRadius: 8, color: isAm ? AM_TEXT : PM_TEXT, cursor: "pointer", fontSize: 12, fontWeight: 700 } }, "＋")
    );
  }
  function DayColumn({ dayIndex, date, amTodos, pmTodos, accent, isToday, doneIds, onEdit, onDelete, onToggle, onAdd, sortDrag }) {
    const amId = `d${dayIndex}-am`, pmId = `d${dayIndex}-pm`;
    const slotProps = { doneIds, onEdit, onDelete, onToggle, onAdd, sortDrag };
    return /* @__PURE__ */ React.createElement("div", { style: { ...FONT_STYLE, background: "#fff", border: `${isToday ? "2px" : "1.5px"} solid ${isToday ? PINK : "#e2e2e2"}`, borderRadius: 14, padding: "14px 12px", boxShadow: isToday ? `0 0 0 3px ${PINK_LIGHT}` : "0 1px 4px rgba(0,0,0,.06)" } }, /* @__PURE__ */ React.createElement("div", { style: { marginBottom: 4 } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 6 } }, /* @__PURE__ */ React.createElement("div", { style: { width: 3, height: 16, background: accent, borderRadius: 2 } }), /* @__PURE__ */ React.createElement("span", { style: { ...FONT_STYLE, fontSize: 13, fontWeight: isToday ? 700 : 400, color: isToday ? PINK : "#111" } }, getDayLabel(dayIndex, date))), /* @__PURE__ */ React.createElement("div", { style: { ...FONT_STYLE, fontSize: 15, fontWeight: 700, color: isToday ? PINK : "#111", marginTop: 3, marginLeft: 9 } }, fmtDate(date), "（", DAYS_JP[date.getDay()], "）")), /* @__PURE__ */ React.createElement(VolumeBar, { amCount: amTodos.length, pmCount: pmTodos.length }), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 8 } }, /* @__PURE__ */ React.createElement(SlotColumn, { colId: amId, isAm: true, todos: amTodos, ...slotProps }), /* @__PURE__ */ React.createElement(SlotColumn, { colId: pmId, isAm: false, todos: pmTodos, ...slotProps })));
  }
  function InboxPage({ todos, doneIds, onEdit, onDelete, onToggle, onAdd, sortDrag, onQuickAdd, dateCols }) {
    const sorted = useMemo(() => [...todos].sort((a, b) => (b.important ? 1 : 0) - (a.important ? 1 : 0)), [todos]);
    return /* @__PURE__ */ React.createElement("div", { style: { ...FONT_STYLE, maxWidth: 640, margin: "0 auto" } }, /* @__PURE__ */ React.createElement("div", { style: { marginBottom: 14 } }, /* @__PURE__ */ React.createElement(QuickEntry, { onAdd: onQuickAdd, dateCols })), /* @__PURE__ */ React.createElement("div", { style: { ...FONT_STYLE, background: "#fff", border: "1.5px solid #e2e2e2", borderRadius: 14, padding: "16px 14px", boxShadow: "0 1px 4px rgba(0,0,0,.06)" } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 6, marginBottom: 12 } }, /* @__PURE__ */ React.createElement("div", { style: { width: 3, height: 16, background: PINK, borderRadius: 2 } }), /* @__PURE__ */ React.createElement("span", { style: { ...FONT_STYLE, fontSize: 14, fontWeight: 700, color: "#111" } }, "ストック"), /* @__PURE__ */ React.createElement("span", { style: { ...FONT_STYLE, fontSize: 11, color: "#aaa", marginLeft: 4 } }, "とりあえずためておく場所")), /* @__PURE__ */ React.createElement("div", { style: { height: 1, background: "#f0f0f0", marginBottom: 12 } }), sorted.length === 0 && /* @__PURE__ */ React.createElement("div", { style: { ...FONT_STYLE, fontSize: 12, color: "#ccc", textAlign: "center", padding: "24px 0" } }, "タスクがありません"), sorted.map((t, i) => /* @__PURE__ */ React.createElement(TodoCard, { key: t.id, todo: t, sortIdx: i, colId: "inbox", isDone: doneIds.has(t.id), isAm: false, onEdit: (todo) => onEdit(todo, "inbox"), onDelete, onToggle, sortDrag })), /* @__PURE__ */ React.createElement("button", { onClick: onAdd, style: { ...FONT_STYLE, marginTop: 8, width: "100%", padding: "8px", background: "transparent", border: "1.5px dashed #ccc", borderRadius: 8, color: "#aaa", fontSize: 12, fontWeight: 700, cursor: "pointer" } }, "＋ 追加")));
  }
  const HINT_CHIPS = [
    { label: "毎日", insert: "毎日 ", color: PINK, bg: PINK_LIGHT },
    { label: "毎週月", insert: "毎週月 ", color: "#185FA5", bg: "#E6F1FB" },
    { label: "毎週月水金", insert: "毎週月水金 ", color: "#185FA5", bg: "#E6F1FB" },
    { label: "明日", insert: "明日 ", color: "#3B6D11", bg: "#EAF3DE" },
    { label: "今日", insert: "今日 ", color: "#3B6D11", bg: "#EAF3DE" },
    { label: "2週", insert: "2週 ", color: "#854F0B", bg: "#FAEEDA" },
    { label: "3日毎", insert: "3日毎 ", color: "#993556", bg: "#FBEAF0" },
    { label: "毎月1日", insert: "毎月1日 ", color: "#3C3489", bg: "#EEEDFE" },
    { label: "AM", insert: "AM ", color: AM_TEXT, bg: AM_LIGHT },
    { label: "PM", insert: "PM ", color: PM_TEXT, bg: PM_LIGHT }
  ];
  function QuickEntry({ onAdd, dateCols }) {
    const [text, setText] = useState(""), [focused, setFocused] = useState(false);
    const textareaRef = useRef(null);
    const previews = useMemo(() => previewLines(text), [text]);
    const valid = useMemo(() => previews.filter((p) => p.parsed), [previews]);
    const destLabel = (parsed) => {
      if (!parsed) return null;
      const ids = resolveColIds(parsed, dateCols);
      if (!(ids == null ? void 0 : ids.length)) return { text: "📥 ストック", bg: PINK_LIGHT, color: PINK_TEXT };
      const slot = ids[0].endsWith("am");
      if (ids.length === 1) {
        const i = +ids[0].match(/^d(\d+)/)[1];
        return { text: `→ ${getDayLabel(i)} ${slot ? "🌱AM" : "☀️PM"}`, bg: slot ? AM_LIGHT : PM_LIGHT, color: slot ? AM_TEXT : PM_TEXT };
      }
      return { text: `→ ${ids.length}日分 ${slot ? "🌱AM" : "☀️PM"}`, bg: slot ? AM_LIGHT : PM_LIGHT, color: slot ? AM_TEXT : PM_TEXT };
    };
    const { ic, dc } = useMemo(() => {
      const ic2 = valid.filter((p) => {
        var _a;
        return !((_a = resolveColIds(p.parsed, dateCols)) == null ? void 0 : _a.length);
      }).length;
      return { ic: ic2, dc: valid.length - ic2 };
    }, [valid, dateCols]);
    const submit = () => {
      if (!valid.length) return;
      onAdd(valid.map((p) => ({ id: genId(), ...p.parsed })));
      setText("");
    };
    const btnLabel = ic > 0 && dc > 0 ? `${dc}件を直接追加・${ic}件をストックへ` : dc > 0 ? `${dc}件を直接ボードに追加` : `${ic}件をストックに追加`;
    const insertChip = (insert) => {
      const ta = textareaRef.current;
      if (!ta) {
        setText((p) => p + insert);
        return;
      }
      const s = ta.selectionStart, e = ta.selectionEnd;
      const next = text.slice(0, s) + insert + text.slice(e);
      setText(next);
      requestAnimationFrame(() => {
        ta.focus();
        ta.setSelectionRange(s + insert.length, s + insert.length);
      });
    };
    const isMobile = window.innerWidth < 720;
    const chipStyle = (color, bg) => ({ ...FONT_STYLE, display: "inline-flex", alignItems: "center", padding: isMobile ? "4px 8px" : "4px 9px", borderRadius: 99, fontSize: isMobile ? 10 : 11, fontWeight: 700, cursor: "pointer", border: "1px solid", background: bg, color, borderColor: color + "55", whiteSpace: "nowrap", userSelect: "none" });
    return /* @__PURE__ */ React.createElement("div", { style: { ...FONT_STYLE, background: "#fff", border: `1.5px solid ${focused ? PINK : "#d8d8d8"}`, borderRadius: 12, padding: window.innerWidth < 720 ? "10px 12px" : "14px 16px", marginBottom: 12, boxShadow: focused ? `0 0 0 3px ${PINK_LIGHT}` : "0 1px 3px rgba(0,0,0,.06)", boxSizing: "border-box", width: "100%", overflow: "hidden" } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 6, marginBottom: 8 } }, /* @__PURE__ */ React.createElement("span", { style: { fontSize: 12, fontWeight: 700, color: PINK } }, "⚡ クイック入力"), /* @__PURE__ */ React.createElement("span", { style: { fontSize: 10, color: "#bbb", marginLeft: "auto" } }, "⌘Enter")), /* @__PURE__ */ React.createElement(
      "textarea",
      {
        ref: textareaRef,
        value: text,
        onChange: (e) => setText(e.target.value),
        onFocus: () => setFocused(true),
        onBlur: () => setFocused(false),
        onKeyDown: (e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            submit();
          }
        },
        rows: 2,
        placeholder: "タスク名 + 日時語句…",
        style: { ...FONT_STYLE, width: "100%", background: "#f7f7f7", border: "1.5px solid #e8e8e8", borderRadius: 6, padding: "9px 11px", fontSize: 13, color: "#333", lineHeight: 1.6, resize: "none", outline: "none", boxSizing: "border-box" }
      }
    ), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 } }, HINT_CHIPS.map((ch) => /* @__PURE__ */ React.createElement("span", { key: ch.label, onClick: () => insertChip(ch.insert), style: { ...chipStyle(ch.color, ch.bg) } }, ch.label))), text.trim() && /* @__PURE__ */ React.createElement("div", { style: { marginTop: 8, background: "#f8f8f8", borderRadius: 8, padding: "8px 10px" } }, previews.map((item, i) => {
      if (!item.original.trim()) return null;
      const p = item.parsed, dest = p ? destLabel(p) : null;
      const lbl = routineLabel(p == null ? void 0 : p.routine);
      return /* @__PURE__ */ React.createElement("div", { key: `pv-${i}`, style: { display: "flex", alignItems: "center", gap: 6, fontSize: 12, marginBottom: i < previews.filter((x) => x.original.trim()).length - 1 ? 5 : 0, opacity: p ? 1 : 0.4 } }, /* @__PURE__ */ React.createElement("span", { style: { color: p ? "#1b7a3a" : "#cc3333", fontSize: 11, fontWeight: 700, flexShrink: 0 } }, p ? "✓" : "✗"), /* @__PURE__ */ React.createElement("span", { style: { color: "#222", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, p ? p.text : item.original), lbl && /* @__PURE__ */ React.createElement("span", { style: { ...FONT_STYLE, fontSize: 10, fontWeight: 700, color: PINK_TEXT, background: PINK_LIGHT, borderRadius: 99, padding: "2px 7px", whiteSpace: "nowrap", flexShrink: 0 } }, "🔁 ", lbl), dest && /* @__PURE__ */ React.createElement("span", { style: { ...FONT_STYLE, fontSize: 10, fontWeight: 700, color: dest.color, background: dest.bg, borderRadius: 99, padding: "2px 7px", whiteSpace: "nowrap", flexShrink: 0 } }, dest.text));
    }), valid.length > 0 && /* @__PURE__ */ React.createElement("button", { onClick: submit, style: { ...FONT_STYLE, marginTop: 8, width: "100%", padding: "8px", background: "#0d0d0d", color: "#fff", fontSize: 12, fontWeight: 700, borderRadius: 6, border: "none", cursor: "pointer" } }, btnLabel)));
  }
  function sameRoutine(a, b) {
    if (!a || !b) return false;
    if (a.type !== b.type) return false;
    if (a.type === "weekly") return JSON.stringify([...a.days].sort()) === JSON.stringify([...b.days].sort());
    if (a.type === "monthly") return a.day === b.day;
    if (a.type === "date") return a.month === b.month && a.day === b.day;
    if (a.type === "nweekly" || a.type === "ndaily") return a.interval === b.interval && a.startDate === b.startDate;
    return a.type === "daily";
  }
  function RoutineManager({ routines, onAdd, onUpdate, onDelete, onToggle }) {
    const [editDef, setEditDef] = useState(null), [text, setText] = useState(""), [rtype, setRtype] = useState("weekly");
    const [wdays, setWdays] = useState([]), [slot, setSlot] = useState("am"), [expiresAt, setExpiresAt] = useState(""), [mday, setMday] = useState(1);
    const openNew = () => {
      setEditDef({});
      setText("");
      setRtype("weekly");
      setWdays([]);
      setSlot("am");
      setExpiresAt("");
      setMday(1);
    };
    const openEdit = (def) => {
      var _a, _b, _c;
      setEditDef(def);
      setText(def.text);
      setRtype(((_a = def.routine) == null ? void 0 : _a.type) || "weekly");
      setWdays(((_b = def.routine) == null ? void 0 : _b.days) || []);
      setSlot(def.slotHint || "am");
      setExpiresAt(def.expiresAt || "");
      setMday(((_c = def.routine) == null ? void 0 : _c.day) || 1);
    };
    const togDay = (d) => setWdays((p) => p.includes(d) ? p.filter((x) => x !== d) : [...p, d].sort());
    const RM_KNOWN_RTYPES = ["daily", "weekly", "monthly"];
    const save = () => {
      var _a;
      if (!text.trim()) return;
      const routine = rtype === "daily" ? { type: "daily" } : rtype === "weekly" ? { type: "weekly", days: wdays } : rtype === "monthly" ? { type: "monthly", day: mday } : (_a = editDef == null ? void 0 : editDef.routine) != null ? _a : { type: "weekly", days: wdays };
      const def = { ...(editDef == null ? void 0 : editDef.id) ? editDef : {}, id: (editDef == null ? void 0 : editDef.id) || genId(), text: text.trim(), routine, slotHint: slot, active: (editDef == null ? void 0 : editDef.active) !== false, expiresAt: expiresAt || null };
      (editDef == null ? void 0 : editDef.id) ? onUpdate(def) : onAdd(def);
      setEditDef(null);
    };
    const inp = { ...FONT_STYLE, background: "#f7f7f7", border: "1.5px solid #e0e0e0", borderRadius: 6, color: "#111", padding: "7px 10px", fontSize: 13, outline: "none" };
    const routineStr = (def) => routineLabel(def.routine) || "";
    const sortKey = (def) => {
      const r = def.routine;
      if (!r) return 999;
      if (r.type === "daily") return -1;
      if (r.type === "weekly") return Math.min(...r.days);
      if (r.type === "monthly") return 100 + (r.day || 0);
      return 999;
    };
    const sorted = [...routines].sort((a, b) => sortKey(a) - sortKey(b));
    const btn = (active) => ({ ...FONT_STYLE, padding: "7px 16px", borderRadius: 6, fontSize: 13, cursor: "pointer", fontWeight: 700, background: active ? "#0d0d0d" : "#f5f5f5", border: `1.5px solid ${active ? "#0d0d0d" : "#ddd"}`, color: active ? "#fff" : "#555" });
    return /* @__PURE__ */ React.createElement("div", { style: { ...FONT_STYLE, maxWidth: 640, margin: "0 auto" } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 } }, /* @__PURE__ */ React.createElement("div", { style: { ...FONT_STYLE, fontSize: 14, fontWeight: 700, color: "#111" } }, "ルーティン定義 (", routines.length, "件)"), /* @__PURE__ */ React.createElement("button", { onClick: openNew, style: { ...FONT_STYLE, padding: "8px 16px", background: "#0d0d0d", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer" } }, "＋ 新規追加")), routines.length === 0 && /* @__PURE__ */ React.createElement("div", { style: { background: "#fff", border: "1.5px solid #e2e2e2", borderRadius: 14, padding: "32px", textAlign: "center" } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 28, marginBottom: 8 } }, "🔁"), /* @__PURE__ */ React.createElement("div", { style: { ...FONT_STYLE, fontSize: 13, color: "#aaa" } }, "ルーティンがありません"), /* @__PURE__ */ React.createElement("div", { style: { ...FONT_STYLE, fontSize: 11, color: "#ccc", marginTop: 4 } }, "「＋ 新規追加」から作成してください")), sorted.map((def) => {
      const today = /* @__PURE__ */ new Date();
      today.setHours(0, 0, 0, 0);
      const expired = def.expiresAt && new Date(def.expiresAt) < today;
      return /* @__PURE__ */ React.createElement("div", { key: def.id, style: { background: "#fff", border: `1.5px solid ${expired ? "#f0d0d0" : def.active ? "#e2e2e2" : "#eee"}`, borderRadius: 12, padding: "14px 16px", marginBottom: 10, opacity: def.active && !expired ? 1 : 0.6 } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 10 } }, /* @__PURE__ */ React.createElement("div", { onClick: () => !expired && onToggle(def.id), style: { width: 36, height: 20, borderRadius: 10, background: def.active && !expired ? "#0d0d0d" : "#ddd", cursor: expired ? "default" : "pointer", position: "relative", flexShrink: 0, transition: "background .2s" } }, /* @__PURE__ */ React.createElement("div", { style: { position: "absolute", top: 2, left: def.active && !expired ? 18 : 2, width: 16, height: 16, borderRadius: "50%", background: "#fff", transition: "left .2s" } })), /* @__PURE__ */ React.createElement("div", { style: { flex: 1, minWidth: 0 } }, /* @__PURE__ */ React.createElement("div", { style: { ...FONT_STYLE, fontSize: 14, fontWeight: 700, color: "#111", marginBottom: 3 } }, def.text), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" } }, /* @__PURE__ */ React.createElement("span", { style: { fontSize: 11, fontWeight: 700, color: PINK_TEXT, background: PINK_LIGHT, borderRadius: 4, padding: "2px 8px" } }, "🔁 ", routineStr(def)), /* @__PURE__ */ React.createElement("span", { style: { fontSize: 11, fontWeight: 700, color: def.slotHint === "am" ? AM_TEXT : PM_TEXT, background: def.slotHint === "am" ? AM_LIGHT : PM_LIGHT, borderRadius: 4, padding: "2px 8px" } }, def.slotHint === "am" ? "🌱 AM" : "☀️ PM"), def.expiresAt && /* @__PURE__ */ React.createElement("span", { style: { fontSize: 11, fontWeight: 700, color: expired ? "#cc3333" : "#888", background: expired ? "#ffeaea" : "#f5f5f5", borderRadius: 4, padding: "2px 8px" } }, expired ? "⚠️ 期限切れ" : "📅", " ", def.expiresAt, "まで"), !def.expiresAt && /* @__PURE__ */ React.createElement("span", { style: { fontSize: 11, color: "#aaa" } }, "無期限"))), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 4, flexShrink: 0 } }, /* @__PURE__ */ React.createElement("button", { onClick: () => openEdit(def), style: { background: "#f5f5f5", border: "1.5px solid #e0e0e0", borderRadius: 6, padding: "5px 10px", fontSize: 12, cursor: "pointer", color: "#555" } }, "✏️ 編集"), /* @__PURE__ */ React.createElement("button", { onClick: () => onDelete(def.id), style: { background: "#fff0f0", border: "1.5px solid #f0d0d0", borderRadius: 6, padding: "5px 10px", fontSize: 12, cursor: "pointer", color: "#cc3333" } }, "🗑"))));
    }), editDef !== null && /* @__PURE__ */ React.createElement("div", { style: { position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 2e3 }, onClick: () => setEditDef(null) }, /* @__PURE__ */ React.createElement("div", { style: { ...FONT_STYLE, background: "#fff", borderRadius: "20px 20px 0 0", padding: "24px 20px 40px", width: "100%", maxWidth: 520, boxShadow: "0 -4px 24px rgba(0,0,0,.12)", maxHeight: "90vh", overflowY: "auto" }, onClick: (e) => e.stopPropagation() }, /* @__PURE__ */ React.createElement("div", { style: { width: 40, height: 4, background: "#ddd", borderRadius: 2, margin: "0 auto 20px" } }), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 13, fontWeight: 700, color: PINK, marginBottom: 14 } }, (editDef == null ? void 0 : editDef.id) ? "ルーティンを編集" : "新しいルーティン"), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, fontWeight: 700, color: "#aaa", marginBottom: 6 } }, "タスク名"), /* @__PURE__ */ React.createElement("input", { value: text, onChange: (e) => setText(e.target.value), placeholder: "タスクの内容...", style: { ...inp, width: "100%", boxSizing: "border-box", marginBottom: 16, fontSize: 16, padding: "10px 12px" } }), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, fontWeight: 700, color: "#aaa", marginBottom: 8 } }, "繰り返し"), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" } }, [["daily", "毎日"], ["weekly", "毎週"], ["monthly", "毎月"]].map(([v, l]) => /* @__PURE__ */ React.createElement("button", { key: v, onClick: () => setRtype(v), style: btn(rtype === v) }, l)), !RM_KNOWN_RTYPES.includes(rtype) && /* @__PURE__ */ React.createElement("button", { style: { ...btn(true), cursor: "default" } }, "🔁 ", routineLabel(editDef == null ? void 0 : editDef.routine) || "カスタム")), !RM_KNOWN_RTYPES.includes(rtype) && /* @__PURE__ */ React.createElement("div", { style: { ...FONT_STYLE, fontSize: 11, color: "#aaa", marginBottom: 12 } }, "この繰り返し設定はクイック入力で作成されたものです。保存しても設定は維持されます。"), rtype === "weekly" && /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" } }, DAYS_JP.map((d, i) => /* @__PURE__ */ React.createElement("button", { key: i, onClick: () => togDay(i), style: { ...FONT_STYLE, width: 40, height: 40, borderRadius: 8, fontSize: 14, cursor: "pointer", fontWeight: 700, background: wdays.includes(i) ? "#0d0d0d" : "#f5f5f5", border: `1.5px solid ${wdays.includes(i) ? "#0d0d0d" : "#ddd"}`, color: wdays.includes(i) ? "#fff" : i === 0 ? "#e03030" : i === 6 ? PINK : "#444" } }, d))), rtype === "monthly" && /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 10, marginBottom: 16 } }, /* @__PURE__ */ React.createElement("span", { style: { fontSize: 16, color: "#666" } }, "毎月"), /* @__PURE__ */ React.createElement("input", { type: "number", min: "1", max: "31", value: mday, onChange: (e) => setMday(+e.target.value), style: { ...inp, width: 64 } }), /* @__PURE__ */ React.createElement("span", { style: { fontSize: 16, color: "#666" } }, "日")), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, fontWeight: 700, color: "#aaa", marginBottom: 8 } }, "時間帯"), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 8, marginBottom: 16 } }, [["am", "🌱 AM"], ["pm", "☀️ PM"]].map(([v, l]) => /* @__PURE__ */ React.createElement("button", { key: v, onClick: () => setSlot(v), style: btn(slot === v) }, l))), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, fontWeight: 700, color: "#aaa", marginBottom: 8 } }, "有効期限（なし＝無期限）"), /* @__PURE__ */ React.createElement("input", { type: "date", value: expiresAt, onChange: (e) => setExpiresAt(e.target.value), style: { ...inp, width: "100%", boxSizing: "border-box", marginBottom: expiresAt ? 4 : 20 } }), expiresAt && /* @__PURE__ */ React.createElement("button", { onClick: () => setExpiresAt(""), style: { ...FONT_STYLE, fontSize: 11, color: "#aaa", background: "none", border: "none", cursor: "pointer", marginBottom: 16, display: "block" } }, "✕ 期限をクリア"), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 10 } }, /* @__PURE__ */ React.createElement("button", { onClick: () => setEditDef(null), style: { ...FONT_STYLE, flex: 1, padding: 12, borderRadius: 8, fontSize: 14, fontWeight: 700, background: "#f5f5f5", border: "1.5px solid #e0e0e0", color: "#666", cursor: "pointer" } }, "キャンセル"), /* @__PURE__ */ React.createElement("button", { onClick: save, style: { ...FONT_STYLE, flex: 2, padding: 12, borderRadius: 8, fontSize: 14, fontWeight: 700, background: "#0d0d0d", border: "none", color: "#fff", cursor: "pointer" } }, "保存して反映")))));
  }
  function GuideCard({ emoji, title, color, bg, border, children }) {
    return /* @__PURE__ */ React.createElement("div", { style: { background: bg, border: `1.5px solid ${border}`, borderRadius: 14, padding: "18px 16px", marginBottom: 16 } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, marginBottom: 12 } }, /* @__PURE__ */ React.createElement("span", { style: { fontSize: 22 } }, emoji), /* @__PURE__ */ React.createElement("span", { style: { ...FONT_STYLE, fontSize: 15, fontWeight: 700, color } }, title)), children);
  }
  function GuideStep({ num, text, sub }) {
    return /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 10, marginBottom: 10, alignItems: "flex-start" } }, /* @__PURE__ */ React.createElement("div", { style: { width: 22, height: 22, borderRadius: "50%", background: "#0d0d0d", color: "#fff", fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 } }, num), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { style: { ...FONT_STYLE, fontSize: 13, color: "#111", fontWeight: 500 } }, text), sub && /* @__PURE__ */ React.createElement("div", { style: { ...FONT_STYLE, fontSize: 11, color: "#888", marginTop: 2 } }, sub)));
  }
  function GuideMockCard({ text, routine, isAm, isDone }) {
    const ac = isAm ? AM_ACCENT : PM_ACCENT, ct = isAm ? AM_TEXT : PM_TEXT, cb = isAm ? AM_LIGHT : PM_LIGHT;
    const border = isAm ? AM_BORDER : PM_BORDER;
    return /* @__PURE__ */ React.createElement("div", { style: { background: isDone ? "#fafafa" : "#fff", border: `1.5px solid ${isDone ? "#eee" : border}`, borderRadius: 10, padding: "9px 10px", marginBottom: 6, opacity: isDone ? 0.6 : 1 } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8 } }, /* @__PURE__ */ React.createElement("div", { style: { width: 16, height: 16, borderRadius: 3, border: `2px solid ${isDone ? ac : "#ccc"}`, background: isDone ? ac : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 } }, isDone && /* @__PURE__ */ React.createElement("span", { style: { color: "#fff", fontSize: 10, fontWeight: 700 } }, "✓")), /* @__PURE__ */ React.createElement("div", { style: { flex: 1 } }, /* @__PURE__ */ React.createElement("div", { style: { ...FONT_STYLE, fontSize: 12, fontWeight: 500, color: isDone ? "#aaa" : "#111", textDecoration: isDone ? "line-through" : "none" } }, text), routine && /* @__PURE__ */ React.createElement("span", { style: { ...FONT_STYLE, fontSize: 10, fontWeight: 700, color: ct, background: cb, borderRadius: 4, padding: "1px 6px", display: "inline-block", marginTop: 3 } }, "🔁 ", routine)), /* @__PURE__ */ React.createElement("span", { style: { color: "#ccc", fontSize: 12 } }, "✏️🗑")));
  }
  function GuideMockSlot({ isAm, todos = [] }) {
    const bg = isAm ? AM_BG : PM_BG, border = isAm ? AM_BORDER : PM_BORDER, head = isAm ? AM_HEAD : PM_HEAD;
    return /* @__PURE__ */ React.createElement("div", { style: { background: bg, border: `1.5px solid ${border}`, borderRadius: 10, padding: "10px", flex: 1, minWidth: 0 } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, fontWeight: 700, color: head, marginBottom: 6 } }, isAm ? "🌱 AM" : "☀️ PM"), todos.map((t, i) => /* @__PURE__ */ React.createElement(GuideMockCard, { key: i, ...t, isAm })), todos.length === 0 && /* @__PURE__ */ React.createElement("div", { style: { ...FONT_STYLE, fontSize: 11, color: "#ccc", textAlign: "center", padding: "8px 0", fontStyle: "italic" } }, "ドロップ"));
  }
  function QuickGuide() {
    return /* @__PURE__ */ React.createElement("div", { style: { ...FONT_STYLE, maxWidth: 640, margin: "0 auto" } }, /* @__PURE__ */ React.createElement("div", { style: { background: "linear-gradient(135deg,#fce8f1,#fff6ee)", border: "1.5px solid #f5a55a", borderRadius: 14, padding: "20px 18px", marginBottom: 16, textAlign: "center" } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 32, marginBottom: 8 } }, "👋"), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 16, fontWeight: 700, color: "#0d0d0d", marginBottom: 4 } }, "Task Board へようこそ！"), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 12, color: "#888", lineHeight: 1.6 } }, "タスクをAM・PMに分けて管理できる", /* @__PURE__ */ React.createElement("br", null), "シンプルなタスクボードです")), /* @__PURE__ */ React.createElement(GuideCard, { emoji: "🗂", title: "ボードの見方", color: "#2563b0", bg: "#f0f5ff", border: "#b0c8f0" }, /* @__PURE__ */ React.createElement("div", { style: { background: "#fff", border: "1.5px solid #ddd", borderRadius: 10, padding: 12, marginBottom: 12 } }, /* @__PURE__ */ React.createElement("div", { style: { ...FONT_STYLE, fontSize: 10, color: "#aaa", marginBottom: 4 } }, "今日 ", /* @__PURE__ */ React.createElement("strong", { style: { color: "#111", fontSize: 12 } }, "5/21（水）")), /* @__PURE__ */ React.createElement("div", { style: { height: 5, background: "#f0f0f0", borderRadius: 3, marginBottom: 4, display: "flex", overflow: "hidden", gap: 2 } }, /* @__PURE__ */ React.createElement("div", { style: { flex: 2, background: AM_ACCENT, borderRadius: 3 } }), /* @__PURE__ */ React.createElement("div", { style: { flex: 1, background: PM_ACCENT, borderRadius: 3 } })), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 9, display: "flex", justifyContent: "space-between", marginBottom: 10, color: "#666" } }, /* @__PURE__ */ React.createElement("span", { style: { color: AM_TEXT } }, "🌱 AM 2件 (67%)"), /* @__PURE__ */ React.createElement("span", { style: { color: PM_TEXT } }, "☀️ PM 1件 (33%)")), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 8 } }, /* @__PURE__ */ React.createElement(GuideMockSlot, { isAm: true, todos: [{ text: "朝のストレッチ", routine: "毎日" }, { text: "企画書を作成する" }] }), /* @__PURE__ */ React.createElement(GuideMockSlot, { isAm: false, todos: [{ text: "夕食の準備" }] }))), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "#555" } }, /* @__PURE__ */ React.createElement("span", { style: { fontSize: 10, fontWeight: 700, color: AM_TEXT, background: AM_LIGHT, borderRadius: 4, padding: "2px 8px" } }, "🌱 AM"), /* @__PURE__ */ React.createElement("span", null, "午前中のタスク")), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "#555" } }, /* @__PURE__ */ React.createElement("span", { style: { fontSize: 10, fontWeight: 700, color: PM_TEXT, background: PM_LIGHT, borderRadius: 4, padding: "2px 8px" } }, "☀️ PM"), /* @__PURE__ */ React.createElement("span", null, "午後のタスク"))), /* @__PURE__ */ React.createElement("div", { style: { padding: "8px 10px", background: "#fff", border: "1.5px solid #ddd", borderRadius: 8, fontSize: 11, color: "#555" } }, "上部の ", /* @__PURE__ */ React.createElement("strong", null, "カラーバー"), " でAM/PMの量が一目でわかります")), /* @__PURE__ */ React.createElement(GuideCard, { emoji: "➕", title: "タスクを追加する", color: "#2a6e2a", bg: "#f2faf2", border: "#8ed08e" }, /* @__PURE__ */ React.createElement("div", { style: { ...FONT_STYLE, fontSize: 12, fontWeight: 700, color: "#2a6e2a", marginBottom: 12 } }, "2通りの方法があります"), /* @__PURE__ */ React.createElement("div", { style: { marginBottom: 14 } }, /* @__PURE__ */ React.createElement("div", { style: { ...FONT_STYLE, fontSize: 11, fontWeight: 700, color: "#2a6e2a", marginBottom: 6 } }, "① ⚡ クイック入力（おすすめ）"), /* @__PURE__ */ React.createElement("div", { style: { background: "#fff", borderRadius: 10, padding: "12px", border: "1.5px solid #ddd", fontSize: 11, color: "#999", lineHeight: 2 } }, /* @__PURE__ */ React.createElement("div", { style: { background: "#fff", border: "1.5px solid #ddd", borderRadius: 8, padding: "8px 10px", marginBottom: 8, fontSize: 11, color: "#555", lineHeight: 1.6 } }, "入力形式：", /* @__PURE__ */ React.createElement("strong", null, "タスク名 ＋ 日時指定語句 ＋ AM or PM"), /* @__PURE__ */ React.createElement("br", null), /* @__PURE__ */ React.createElement("span", { style: { color: "#888" } }, "例）歯医者　6/15　PM　→ 6月15日のPMに追加")), "買い物　", /* @__PURE__ */ React.createElement("span", { style: { background: "#fce8f1", color: PINK_TEXT, borderRadius: 4, padding: "1px 6px", fontSize: 11, fontWeight: 700 } }, "→ ストック"), /* @__PURE__ */ React.createElement("br", null), "ゴミ出し 毎週火金　", /* @__PURE__ */ React.createElement("span", { style: { background: AM_LIGHT, color: AM_TEXT, borderRadius: 4, padding: "1px 6px", fontSize: 11, fontWeight: 700 } }, "→ 火・金 🌱AM"), /* @__PURE__ */ React.createElement("br", null), "歯医者 6/15 PM　", /* @__PURE__ */ React.createElement("span", { style: { background: PM_LIGHT, color: PM_TEXT, borderRadius: 4, padding: "1px 6px", fontSize: 11, fontWeight: 700 } }, "→ 6/15 ☀️PM"), /* @__PURE__ */ React.createElement("br", null), "朝の体操 毎日　", /* @__PURE__ */ React.createElement("span", { style: { background: AM_LIGHT, color: AM_TEXT, borderRadius: 4, padding: "1px 6px", fontSize: 11, fontWeight: 700 } }, "→ 今日〜6日後 🌱AM")), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, color: "#888", marginTop: 6 } }, "入力後に ", /* @__PURE__ */ React.createElement("strong", null, "Ctrl+Enter"), "（PC）または ", /* @__PURE__ */ React.createElement("strong", null, "追加ボタン"), " を押す")), /* @__PURE__ */ React.createElement("div", { style: { borderTop: "1px solid #d4ead4", paddingTop: 12 } }, /* @__PURE__ */ React.createElement("div", { style: { ...FONT_STYLE, fontSize: 12, fontWeight: 700, color: "#2a6e2a", marginBottom: 8 } }, "② ＋ボタンから追加"), /* @__PURE__ */ React.createElement(GuideStep, { num: "1", text: "各列の「＋ 追加」ボタンをタップ" }), /* @__PURE__ */ React.createElement(GuideStep, { num: "2", text: "タスク名を入力" }), /* @__PURE__ */ React.createElement(GuideStep, { num: "3", text: "ルーティン設定（任意）", sub: "毎日・毎週・毎月・日付指定から選べます" }), /* @__PURE__ */ React.createElement(GuideStep, { num: "4", text: "「保存」を押して完了" }))), /* @__PURE__ */ React.createElement(GuideCard, { emoji: "✅", title: "タスクを操作する", color: "#7030b0", bg: "#f8f2ff", border: "#c8a0e0" }, /* @__PURE__ */ React.createElement("div", { style: { marginBottom: 12 } }, /* @__PURE__ */ React.createElement(GuideMockCard, { text: "企画書を作成する", isAm: true }), /* @__PURE__ */ React.createElement(GuideMockCard, { text: "メールを確認する", routine: "毎週月・水・金", isAm: true }), /* @__PURE__ */ React.createElement(GuideMockCard, { text: "完了したタスク", isAm: false, isDone: true })), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 6 } }, [
      ["☑️", "チェックボックスをタップ", "完了/未完了を切り替え"],
      ["✏️", "鉛筆アイコンをタップ", "タスクを編集"],
      ["🗑", "ゴミ箱アイコンをタップ", "ゴミ箱へ移動（3日間保存）"],
      ["👆", "長押し＆ドラッグ", "別の列・日付に移動（スマホ対応）"]
    ].map(([icon, label, desc], i) => /* @__PURE__ */ React.createElement("div", { key: i, style: { display: "flex", gap: 10, alignItems: "center", padding: "8px 10px", background: "#fff", borderRadius: 8, fontSize: 12, color: "#333" } }, /* @__PURE__ */ React.createElement("span", { style: { fontSize: 16, width: 24, textAlign: "center" } }, icon), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("strong", null, label), /* @__PURE__ */ React.createElement("span", { style: { color: "#888" } }, " → ", desc)))))), /* @__PURE__ */ React.createElement(GuideCard, { emoji: "📥", title: "ストックとは", color: PINK_TEXT, bg: PINK_LIGHT, border: "#f0b0cc" }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 12, color: "#555", lineHeight: 1.7, marginBottom: 12 } }, "日程未定のタスクや、とりあえずメモしたいことを置く場所。", /* @__PURE__ */ React.createElement("br", null), "ストックから各日付のAM/PMへドラッグして移動できます。"), /* @__PURE__ */ React.createElement("div", { style: { background: "#fff", border: "1.5px solid #ddd", borderRadius: 10, padding: 12, marginBottom: 8 } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 10, fontWeight: 700, color: PINK_TEXT, marginBottom: 8 } }, "📥 ストック"), /* @__PURE__ */ React.createElement(GuideMockCard, { text: "企画書のフォーマット修正", isAm: false }), /* @__PURE__ */ React.createElement(GuideMockCard, { text: "メールを確認する", routine: "毎週月・水・金", isAm: false }), /* @__PURE__ */ React.createElement(GuideMockCard, { text: "歯医者の予約をとる", isAm: false }), /* @__PURE__ */ React.createElement(GuideMockCard, { text: "買い物リストを更新する", isAm: false }), /* @__PURE__ */ React.createElement(GuideMockCard, { text: "週次レポートを提出", routine: "毎週金", isAm: false }), /* @__PURE__ */ React.createElement(GuideMockCard, { text: "クリーニングを取りに行く", isAm: false }), /* @__PURE__ */ React.createElement("div", { style: { marginTop: 6, border: "1.5px dashed #ddd", borderRadius: 6, padding: 6, textAlign: "center", fontSize: 11, color: "#ccc" } }, "＋ 追加")), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, color: "#888" } }, "長押し＆ドラッグで日付列のAM/PMに移動できます")), /* @__PURE__ */ React.createElement(GuideCard, { emoji: "🔁", title: "ルーティン管理", color: "#b07020", bg: "#fff8ee", border: "#f0c878" }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 12, color: "#555", lineHeight: 1.7, marginBottom: 12 } }, "毎日・毎週など繰り返すタスクを登録しておくと、", /* @__PURE__ */ React.createElement("br", null), "アプリを開くたびに自動で今週の列に追加されます。"), /* @__PURE__ */ React.createElement("div", { style: { background: "#fff", borderRadius: 10, padding: "12px", border: "1.5px solid #e8d8b0", marginBottom: 10 } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center" } }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 13, fontWeight: 700, color: "#111" } }, "朝のストレッチ"), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 6, marginTop: 4, flexWrap: "wrap" } }, /* @__PURE__ */ React.createElement("span", { style: { fontSize: 10, fontWeight: 700, color: PINK_TEXT, background: PINK_LIGHT, borderRadius: 4, padding: "2px 8px" } }, "🔁 毎日"), /* @__PURE__ */ React.createElement("span", { style: { fontSize: 10, fontWeight: 700, color: AM_TEXT, background: AM_LIGHT, borderRadius: 4, padding: "2px 8px" } }, "🌱 AM"), /* @__PURE__ */ React.createElement("span", { style: { fontSize: 11, color: "#aaa" } }, "無期限"))), /* @__PURE__ */ React.createElement("div", { style: { width: 36, height: 20, borderRadius: 10, background: "#0d0d0d", position: "relative", flexShrink: 0 } }, /* @__PURE__ */ React.createElement("div", { style: { position: "absolute", top: 2, left: 18, width: 16, height: 16, borderRadius: "50%", background: "#fff" } })))), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, color: "#888", lineHeight: 1.8 } }, "📅 ", /* @__PURE__ */ React.createElement("strong", null, "有効期限"), "を設定すると期限後は自動生成されません", /* @__PURE__ */ React.createElement("br", null), "🔘 ", /* @__PURE__ */ React.createElement("strong", null, "トグルスイッチ"), "でON/OFFを切り替えられます")), /* @__PURE__ */ React.createElement(GuideCard, { emoji: "🗑", title: "ゴミ箱", color: "#666", bg: "#f5f5f5", border: "#ddd" }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 12, color: "#555", lineHeight: 1.7, marginBottom: 12 } }, "削除したタスクは即座に消えず、", /* @__PURE__ */ React.createElement("strong", null, "3日間ゴミ箱に保存"), "されます。"), /* @__PURE__ */ React.createElement("div", { style: { background: "#fff", borderRadius: 10, padding: "12px", border: "1.5px solid #e0e0e0", marginBottom: 10 } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 10 } }, /* @__PURE__ */ React.createElement("div", { style: { flex: 1 } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 12, fontWeight: 500, color: "#aaa", textDecoration: "line-through" } }, "買い物リスト更新"), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 10, color: "#ccc", marginTop: 2 } }, "2日後に消去")), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 6 } }, /* @__PURE__ */ React.createElement("span", { style: { fontSize: 11, fontWeight: 700, color: "#2a6e2a", background: "#e4f5e4", borderRadius: 6, padding: "4px 10px" } }, "↩ 復元"), /* @__PURE__ */ React.createElement("span", { style: { fontSize: 11, color: "#cc3333", background: "#fff0f0", borderRadius: 6, padding: "4px 8px" } }, "✕")))), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, color: "#888" } }, "3日経過すると自動で完全削除されます")), /* @__PURE__ */ React.createElement(GuideCard, { emoji: "📝", title: "クイック入力参考例", color: "#2563b0", bg: "#f0f5ff", border: "#b0c8f0" }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 3 } }, [
      ["買い物", "📥 ストック"],
      ["買い物　明日", "→ 明日 🌱AM"],
      ["買い物　明日　PM", "→ 明日 ☀️PM"],
      ["ゴミ出し　毎週火金", "→ 火・金 🌱AM（毎週）"],
      ["朝の体操　毎日", "→ 今日〜6日後 🌱AM"],
      ["夜のストレッチ　毎日　PM", "→ 今日〜6日後 ☀️PM"],
      ["歯医者　6/15", "→ 6/15 🌱AM"],
      ["歯医者　6/15　PM", "→ 6/15 ☀️PM"],
      ["請求書　毎月25日", "→ 今月25日 🌱AM"]
    ].map(([input, output], i) => /* @__PURE__ */ React.createElement("div", { key: i, style: { display: "flex", alignItems: "baseline", padding: "5px 8px", background: i % 2 === 0 ? "#fff" : "#f4f7ff", borderRadius: 6 } }, /* @__PURE__ */ React.createElement("span", { style: { ...FONT_STYLE, flex: "0 0 180px", fontSize: 11, color: "#333" } }, input), /* @__PURE__ */ React.createElement("span", { style: { ...FONT_STYLE, fontSize: 11, color: "#888", whiteSpace: "nowrap" } }, output))))));
  }
  function TrashBin({ trash, onRestore, onPermanentDelete, onClearAll }) {
    const now = Date.now();
    const sorted = [...trash].sort((a, b) => b.deletedAt - a.deletedAt);
    const timeLeft = (ms) => {
      const h = Math.floor((THREE_DAYS - (now - ms)) / 36e5), d = Math.floor(h / 24);
      return d > 0 ? `${d}日後に消去` : h > 0 ? `${h}時間後に消去` : "まもなく消去";
    };
    return /* @__PURE__ */ React.createElement("div", { style: { ...FONT_STYLE, maxWidth: 640, margin: "0 auto" } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 } }, /* @__PURE__ */ React.createElement("div", { style: { ...FONT_STYLE, fontSize: 14, fontWeight: 700, color: "#111" } }, "ゴミ箱 (", trash.length, "件)"), trash.length > 0 && /* @__PURE__ */ React.createElement("button", { onClick: onClearAll, style: { ...FONT_STYLE, padding: "7px 14px", background: "#fff0f0", border: "1.5px solid #f0d0d0", borderRadius: 8, fontSize: 12, fontWeight: 700, color: "#cc3333", cursor: "pointer" } }, "🗑 すべて完全削除")), /* @__PURE__ */ React.createElement("div", { style: { ...FONT_STYLE, fontSize: 11, color: "#aaa", marginBottom: 12 } }, "削除後3日で自動消去されます"), trash.length === 0 && /* @__PURE__ */ React.createElement("div", { style: { background: "#fff", border: "1.5px solid #e2e2e2", borderRadius: 14, padding: "32px", textAlign: "center" } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 28, marginBottom: 8 } }, "🗑"), /* @__PURE__ */ React.createElement("div", { style: { ...FONT_STYLE, fontSize: 13, color: "#aaa" } }, "ゴミ箱は空です")), sorted.map((item) => /* @__PURE__ */ React.createElement("div", { key: item.id, style: { background: "#fff", border: "1.5px solid #ebebeb", borderRadius: 12, padding: "12px 14px", marginBottom: 8, display: "flex", alignItems: "center", gap: 10 } }, /* @__PURE__ */ React.createElement("div", { style: { flex: 1, minWidth: 0 } }, /* @__PURE__ */ React.createElement("div", { style: { ...FONT_STYLE, fontSize: 13, fontWeight: 500, color: "#aaa", textDecoration: "line-through", wordBreak: "break-word" } }, item.text), /* @__PURE__ */ React.createElement("div", { style: { ...FONT_STYLE, fontSize: 10, color: "#ccc", marginTop: 3 } }, timeLeft(item.deletedAt))), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 6, flexShrink: 0 } }, /* @__PURE__ */ React.createElement("button", { onClick: () => onRestore(item), style: { ...FONT_STYLE, padding: "6px 12px", background: "#f2faf2", border: "1.5px solid #8ed08e", borderRadius: 7, fontSize: 12, fontWeight: 700, color: "#2a6e2a", cursor: "pointer" } }, "↩ 復元"), /* @__PURE__ */ React.createElement("button", { onClick: () => onPermanentDelete(item.id), style: { ...FONT_STYLE, padding: "6px 10px", background: "#fff0f0", border: "1.5px solid #f0d0d0", borderRadius: 7, fontSize: 12, color: "#cc3333", cursor: "pointer" } }, "✕")))));
  }
  function ReadonlySlot({ isAm, todos, doneIds }) {
    const ac = isAm ? AM_ACCENT : PM_ACCENT;
    return /* @__PURE__ */ React.createElement("div", { style: { ...FONT_STYLE, background: isAm ? "#f8faf8" : "#fffaf6", border: `1.5px solid ${isAm ? "#c8e0c8" : "#e8d0b8"}`, borderRadius: 12, padding: "10px 12px", flex: 1 } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, fontWeight: 700, color: isAm ? AM_HEAD : PM_HEAD, marginBottom: 6 } }, isAm ? "🌱 AM" : "☀️ PM"), todos.length === 0 && /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, color: "#ddd", textAlign: "center", padding: "10px 0", fontStyle: "italic" } }, "なし"), todos.map((t) => /* @__PURE__ */ React.createElement("div", { key: t.id, style: { ...FONT_STYLE, background: "#fff", border: `${t.important ? "2px solid #E24B4A" : "1.5px solid #eee"}`, borderRadius: 8, padding: "8px 10px", marginBottom: 6, opacity: doneIds.has(t.id) ? 0.5 : 1 } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8 } }, /* @__PURE__ */ React.createElement("div", { style: { width: 14, height: 14, borderRadius: 3, border: `2px solid ${doneIds.has(t.id) ? ac : "#ddd"}`, background: doneIds.has(t.id) ? ac : "transparent", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" } }, doneIds.has(t.id) && /* @__PURE__ */ React.createElement("span", { style: { color: "#fff", fontSize: 9, fontWeight: 700 } }, "✓")), /* @__PURE__ */ React.createElement("span", { style: { ...FONT_STYLE, fontSize: t.important ? 13 : 12, fontWeight: t.important ? 700 : 400, color: doneIds.has(t.id) ? "#bbb" : t.important ? "#791F1F" : "#555", textDecoration: doneIds.has(t.id) ? "line-through" : "none", flex: 1, wordBreak: "break-word" } }, t.text)))));
  }
  function App() {
    const dateCols = useMemo(() => getWeekDateCols(0), []);
    const nextWeek1Cols = useMemo(() => getWeekDateCols(1), []);
    const nextWeek2Cols = useMemo(() => getWeekDateCols(2), []);
    const prevWeek1Cols = useMemo(() => getWeekDateCols(-1), []);
    const prevWeek2Cols = useMemo(() => getWeekDateCols(-2), []);
    const [boardWeek, setBoardWeek] = useState(0);
    const [loaded, setLoaded] = useState(false);
    const [authed, setAuthed] = useState(false);
    const [isNewUser, setIsNewUser] = useState(false);
    const [savedHash, setSavedHash] = useState(null);
    const [authError, setAuthError] = useState("");
    const [tab, setTab] = useState("board");
    const [inbox, setInbox] = useState([]);
    const [amCols, setAmCols] = useState(() => dateCols.map(() => []));
    const [pmCols, setPmCols] = useState(() => dateCols.map(() => []));
    const [amNext1, setAmNext1] = useState(() => nextWeek1Cols.map(() => []));
    const [pmNext1, setPmNext1] = useState(() => nextWeek1Cols.map(() => []));
    const [amNext2, setAmNext2] = useState(() => nextWeek2Cols.map(() => []));
    const [pmNext2, setPmNext2] = useState(() => nextWeek2Cols.map(() => []));
    const [amPrev1, setAmPrev1] = useState(() => prevWeek1Cols.map(() => []));
    const [pmPrev1, setPmPrev1] = useState(() => prevWeek1Cols.map(() => []));
    const [amPrev2, setAmPrev2] = useState(() => prevWeek2Cols.map(() => []));
    const [pmPrev2, setPmPrev2] = useState(() => prevWeek2Cols.map(() => []));
    const [amByDate, setAmByDate] = useState({});
    const [pmByDate, setPmByDate] = useState({});
    const [doneIds, setDoneIds] = useState(/* @__PURE__ */ new Set());
    const [routines, setRoutines] = useState([]);
    const [trash, setTrash] = useState([]);
    const [editTodo, setEditTodo] = useState(null);
    const [showModal, setShowModal] = useState(false);
    const getWeekData = (w) => {
      if (w === 1) return { cols: nextWeek1Cols, am: amNext1, pm: pmNext1, setAm: setAmNext1, setPm: setPmNext1 };
      if (w === 2) return { cols: nextWeek2Cols, am: amNext2, pm: pmNext2, setAm: setAmNext2, setPm: setPmNext2 };
      if (w === -1) return { cols: prevWeek1Cols, am: amPrev1, pm: pmPrev1, setAm: setAmPrev1, setPm: setPmPrev1 };
      if (w === -2) return { cols: prevWeek2Cols, am: amPrev2, pm: pmPrev2, setAm: setAmPrev2, setPm: setPmPrev2 };
      return { cols: dateCols, am: amCols, pm: pmCols, setAm: setAmCols, setPm: setPmCols };
    };
    const handleReorder = useCallback((colId, fromIdx, toIdx) => {
      const reorder = (arr) => {
        if (!Number.isInteger(fromIdx) || !Number.isInteger(toIdx) || fromIdx === toIdx || fromIdx < 0 || toIdx < 0 || fromIdx >= arr.length || toIdx >= arr.length) return arr;
        const display = [...arr].sort((a, b) => (b.important ? 1 : 0) - (a.important ? 1 : 0));
        const [item] = display.splice(fromIdx, 1);
        display.splice(toIdx, 0, item);
        return display;
      };
      if (colId === "inbox") {
        setInbox(reorder);
        return;
      }
      const m = colId.match(/^d(\d+)-(am|pm)$/);
      if (!m) return;
      const di = +m[1], isAm = m[2] === "am";
      const { setAm, setPm } = getWeekData(boardWeek);
      const setter = isAm ? setAm : setPm;
      setter((p) => {
        const n = [...p];
        n[di] = reorder(n[di]);
        return n;
      });
    }, [boardWeek]);
    const sortDrag = useSortDrag({ onReorder: handleReorder });
    const [saveFlash, setSaveFlash] = useState(false);
    const [saveError, setSaveError] = useState(false);
    const [showSettings, setShowSettings] = useState(false);
    const importRef = useRef(null);
    const [layout, setLayout] = useState(() => window.innerWidth < 720 ? "stack" : "board");
    useEffect(() => {
      loadState(dateCols).then((s) => {
        if (s == null ? void 0 : s.loadError) {
          setAuthError("データの読み込みに失敗しました。再読み込みしてください。");
          setLoaded(true);
          return;
        }
        if (s) {
          const savedRoutines = s.routines || [];
          const { amCols: newAm, pmCols: newPm } = autoGenerateFromDefinitions(s.amCols, s.pmCols, savedRoutines, dateCols);
          setInbox(s.inbox);
          setAmCols(newAm);
          setPmCols(newPm);
          setDoneIds(s.doneIds);
          setRoutines(savedRoutines);
          setTrash(s.trash || []);
          const abd = s.amByDate || {}, pbd = s.pmByDate || {};
          setAmByDate(abd);
          setPmByDate(pbd);
          setAmNext1(nextWeek1Cols.map((d) => abd[d.toDateString()] || []));
          setPmNext1(nextWeek1Cols.map((d) => pbd[d.toDateString()] || []));
          setAmNext2(nextWeek2Cols.map((d) => abd[d.toDateString()] || []));
          setPmNext2(nextWeek2Cols.map((d) => pbd[d.toDateString()] || []));
          setAmPrev1(prevWeek1Cols.map((d) => abd[d.toDateString()] || []));
          setPmPrev1(prevWeek1Cols.map((d) => pbd[d.toDateString()] || []));
          setAmPrev2(prevWeek2Cols.map((d) => abd[d.toDateString()] || []));
          setPmPrev2(prevWeek2Cols.map((d) => pbd[d.toDateString()] || []));
          setSavedHash(s.passwordHash || null);
          setIsNewUser(!s.passwordHash);
          if (urlUser === "main") {
            setAuthed(true);
          }
        } else {
          setIsNewUser(true);
          if (urlUser === "main") setAuthed(true);
        }
        setLoaded(true);
      });
    }, []);
    useEffect(() => {
      const fn = () => setLayout(window.innerWidth < 720 ? "stack" : "board");
      window.addEventListener("resize", fn);
      return () => window.removeEventListener("resize", fn);
    }, []);
    useEffect(() => {
      if (!loaded || !authed || boardWeek !== 0 || layout !== "stack") return;
      const timer = setTimeout(() => {
        const el = document.getElementById("day-col-0-today-stack");
        if (el) el.scrollIntoView({ block: "start", behavior: "auto" });
      }, 200);
      return () => clearTimeout(timer);
    }, [loaded, authed, layout, boardWeek]);
    useEffect(() => {
      if (!loaded || !authed) return;
      saveState(
        {
          inbox,
          amCols,
          pmCols,
          doneIds,
          routines,
          trash,
          passwordHash: savedHash,
          amByDate,
          pmByDate,
          extraWeeks: [{ cols: nextWeek1Cols, am: amNext1, pm: pmNext1 }, { cols: nextWeek2Cols, am: amNext2, pm: pmNext2 }]
        },
        dateCols,
        () => {
          setSaveError(true);
          setSaveFlash(false);
        },
        () => {
          setSaveError(false);
          setSaveFlash(true);
          setTimeout(() => setSaveFlash(false), 2200);
        }
      );
    }, [inbox, amCols, pmCols, amNext1, pmNext1, amNext2, pmNext2, amByDate, pmByDate, doneIds, routines, trash, loaded, authed]);
    const parseColId = (c) => {
      if (c === "inbox") return { type: "inbox" };
      const m = c.match(/^d(\d+)-(am|pm)$/);
      if (m) return { type: m[2], dayIndex: +m[1] };
      return null;
    };
    const removeFromAll = useCallback((id) => {
      setInbox((p) => p.filter((t) => t.id !== id));
      setAmCols((p) => p.map((c) => c.filter((t) => t.id !== id)));
      setPmCols((p) => p.map((c) => c.filter((t) => t.id !== id)));
      setAmNext1((p) => p.map((c) => c.filter((t) => t.id !== id)));
      setPmNext1((p) => p.map((c) => c.filter((t) => t.id !== id)));
      setAmNext2((p) => p.map((c) => c.filter((t) => t.id !== id)));
      setPmNext2((p) => p.map((c) => c.filter((t) => t.id !== id)));
    }, []);
    const addToCol = useCallback((todo, colId, week = 0) => {
      const p = parseColId(colId);
      if (!p) return;
      if (p.type === "inbox") setInbox((prev) => [...prev, todo]);
      else {
        const setter = week === 1 ? p.type === "am" ? setAmNext1 : setPmNext1 : week === 2 ? p.type === "am" ? setAmNext2 : setPmNext2 : p.type === "am" ? setAmCols : setPmCols;
        setter((prev) => {
          const n = [...prev];
          n[p.dayIndex] = [...n[p.dayIndex], todo];
          return n;
        });
      }
    }, []);
    const handleEdit = (todo, colId) => {
      setEditTodo({ todo, colId, week: colId === "inbox" ? 0 : boardWeek });
      setShowModal(true);
    };
    const handleAdd = (colId) => {
      setEditTodo({ todo: { id: null, text: "", routine: null }, colId, week: colId === "inbox" ? 0 : boardWeek });
      setShowModal(true);
    };
    const handleToggle = (id) => {
      const now = Date.now();
      setDoneIds((p) => {
        const n = new Set(p);
        n.has(id) ? n.delete(id) : n.add(id);
        return n;
      });
      const upd = (l) => l.map((t) => t.id === id ? { ...t, lastCheckedAt: now } : t);
      setInbox(upd);
      setAmCols((p) => p.map(upd));
      setPmCols((p) => p.map(upd));
      setAmNext1((p) => p.map(upd));
      setPmNext1((p) => p.map(upd));
      setAmNext2((p) => p.map(upd));
      setPmNext2((p) => p.map(upd));
    };
    const handleDelete = (id) => {
      const target = allTodos.find((t) => t.id === id);
      if (target) setTrash((p) => [...p, { ...target, deletedAt: Date.now() }]);
      removeFromAll(id);
      setDoneIds((p) => {
        const n = new Set(p);
        n.delete(id);
        return n;
      });
    };
    const handleRestore = (item) => {
      const { deletedAt: _, ...todo } = item;
      setInbox((p) => [...p, { ...todo, id: genId() }]);
      setTrash((p) => p.filter((t) => t.id !== item.id));
    };
    const handleSave = (updated) => {
      var _a;
      if (!editTodo) return;
      const targetWeek = (_a = editTodo.week) != null ? _a : 0;
      if (!updated.id) {
        const base = stampTodo({ ...updated, id: genId() });
        const { cols: activeCols } = getWeekData(targetWeek);
        const colIds = resolveColIds(base, activeCols);
        if (colIds == null ? void 0 : colIds.length) {
          const { setAm, setPm } = getWeekData(targetWeek);
          colIds.forEach((colId) => {
            const p = parseColId(colId);
            if (!p) return;
            if (p.type === "inbox") setInbox((prev) => [...prev, { ...base, id: genId() }]);
            else if (p.type === "am") setAm((prev) => {
              const n = [...prev];
              n[p.dayIndex] = [...n[p.dayIndex], { ...base, id: genId() }];
              return n;
            });
            else setPm((prev) => {
              const n = [...prev];
              n[p.dayIndex] = [...n[p.dayIndex], { ...base, id: genId() }];
              return n;
            });
          });
        } else addToCol(base, editTodo.colId, targetWeek);
      } else {
        const { cols: activeCols } = getWeekData(targetWeek);
        const colIds = resolveColIds(updated, activeCols);
        if (colIds == null ? void 0 : colIds.length) {
          removeFromAll(updated.id);
          const { setAm, setPm } = getWeekData(targetWeek);
          colIds.forEach((colId) => {
            const p = parseColId(colId);
            if (!p) return;
            if (p.type === "inbox") setInbox((prev) => [...prev, { ...updated, id: genId() }]);
            else if (p.type === "am") setAm((prev) => {
              const n = [...prev];
              n[p.dayIndex] = [...n[p.dayIndex], { ...updated, id: genId() }];
              return n;
            });
            else setPm((prev) => {
              const n = [...prev];
              n[p.dayIndex] = [...n[p.dayIndex], { ...updated, id: genId() }];
              return n;
            });
          });
        } else {
          const upd = (l) => l.map((t) => t.id === updated.id ? updated : t);
          setInbox(upd);
          setAmCols((p) => p.map(upd));
          setPmCols((p) => p.map(upd));
          setAmNext1((p) => p.map(upd));
          setPmNext1((p) => p.map(upd));
          setAmNext2((p) => p.map(upd));
          setPmNext2((p) => p.map(upd));
        }
      }
      setShowModal(false);
      setEditTodo(null);
    };
    const handleQuickAdd = (todos) => {
      const newAm = amCols.map((c) => [...c]), newPm = pmCols.map((c) => [...c]);
      let newInbox = [...inbox], newRoutines = [...routines];
      todos.forEach((todo) => {
        var _a;
        const s = stampTodo(todo);
        const isRtn = ["weekly", "daily", "monthly", "nweekly", "ndaily"].includes((_a = s.routine) == null ? void 0 : _a.type);
        const colIds = resolveColIds(s, dateCols);
        if (isRtn) {
          const exists = newRoutines.some((r) => r.text === s.text && sameRoutine(r.routine, s.routine));
          if (!exists) {
            const def = { id: genId(), text: s.text, routine: s.routine, slotHint: s.slotHint || "am", active: true, expiresAt: null };
            newRoutines = [...newRoutines, def];
            colIds == null ? void 0 : colIds.forEach((colId) => {
              const m = colId.match(/^d(\d+)-(am|pm)$/);
              if (!m) return;
              const di = +m[1], isAm = m[2] === "am";
              const task = stampTodo({ ...s, id: genId(), routineDefId: def.id, lastCheckedAt: null });
              if (isAm) newAm[di] = [...newAm[di], task];
              else newPm[di] = [...newPm[di], task];
            });
          }
        } else if (colIds == null ? void 0 : colIds.length) {
          colIds.forEach((colId) => {
            const m = colId.match(/^d(\d+)-(am|pm)$/);
            if (!m) return;
            const di = +m[1], isAm = m[2] === "am";
            if (isAm) newAm[di] = [...newAm[di], { ...s, id: genId() }];
            else newPm[di] = [...newPm[di], { ...s, id: genId() }];
          });
        } else newInbox = [...newInbox, s];
      });
      setInbox(newInbox);
      setAmCols(newAm);
      setPmCols(newPm);
      setRoutines(newRoutines);
    };
    const applyRoutineDef = (def) => {
      const r = syncRoutineDefinition(amCols, pmCols, def, dateCols);
      setAmCols(r.amCols);
      setPmCols(r.pmCols);
      if (r.removedIds.length) setDoneIds((p) => {
        const n = new Set(p);
        r.removedIds.forEach((id) => n.delete(id));
        return n;
      });
    };
    const handleAddRoutine = (def) => {
      setRoutines((p) => [...p, def]);
      applyRoutineDef(def);
    };
    const handleUpdateRoutine = (def) => {
      setRoutines((p) => p.map((r) => r.id === def.id ? def : r));
      applyRoutineDef(def);
    };
    const handleDeleteRoutine = (id) => {
      const removedIds = [...amCols.flat(), ...pmCols.flat()].filter((t) => t.routineDefId === id).map((t) => t.id);
      setRoutines((p) => p.filter((r) => r.id !== id));
      setAmCols((p) => p.map((c) => c.filter((t) => t.routineDefId !== id)));
      setPmCols((p) => p.map((c) => c.filter((t) => t.routineDefId !== id)));
      if (removedIds.length) setDoneIds((p) => {
        const n = new Set(p);
        removedIds.forEach((taskId) => n.delete(taskId));
        return n;
      });
    };
    const handleToggleRoutine = (id) => {
      const def = routines.find((r) => r.id === id);
      if (def) handleUpdateRoutine({ ...def, active: !def.active });
    };
    const handleAuth = async (pw, pw2) => {
      var _a;
      if (!pw.trim()) {
        setAuthError("パスワードを入力してください");
        return;
      }
      let hash;
      try {
        if (!((_a = window.crypto) == null ? void 0 : _a.subtle)) throw new Error("Web Crypto unsupported");
        hash = await hashPassword(pw);
      } catch (e) {
        console.error("password hash error", e);
        setAuthError("このブラウザではログイン処理を利用できません。OS・ブラウザを更新してください。");
        return;
      }
      if (isNewUser) {
        if (pw !== pw2) {
          setAuthError("パスワードが一致しません");
          return;
        }
        if (pw.length < 4) {
          setAuthError("4文字以上で設定してください");
          return;
        }
        setSavedHash(hash);
        setAuthed(true);
        setAuthError("");
        setTimeout(() => saveState({ inbox, amCols, pmCols, doneIds, routines, trash, passwordHash: hash }, dateCols), 100);
      } else {
        if (hash !== savedHash) {
          setAuthError("パスワードが違います");
          return;
        }
        setAuthed(true);
        setAuthError("");
      }
    };
    const allTodos = useMemo(
      () => [
        ...inbox,
        ...amCols.flat(),
        ...pmCols.flat(),
        ...amNext1.flat(),
        ...pmNext1.flat(),
        ...amNext2.flat(),
        ...pmNext2.flat(),
        ...amPrev1.flat(),
        ...pmPrev1.flat(),
        ...amPrev2.flat(),
        ...pmPrev2.flat()
      ],
      [inbox, amCols, pmCols, amNext1, pmNext1, amNext2, pmNext2, amPrev1, pmPrev1, amPrev2, pmPrev2]
    );
    const TODAY = useMemo(() => {
      const d = /* @__PURE__ */ new Date();
      d.setHours(0, 0, 0, 0);
      return d;
    }, []);
    const sp = { doneIds, onEdit: (t, c) => handleEdit(t, c), onDelete: handleDelete, onToggle: handleToggle, onAdd: handleAdd, sortDrag };
    const badge = (n, bg) => /* @__PURE__ */ React.createElement("span", { style: { position: "absolute", top: -6, right: -6, background: bg, color: "#fff", fontSize: 10, fontWeight: 700, borderRadius: 10, padding: "1px 6px" } }, n);
    if (!loaded) return /* @__PURE__ */ React.createElement("div", { style: { minHeight: "100vh", background: "#f5f6f8", display: "flex", alignItems: "center", justifyContent: "center", ...FONT_STYLE } }, /* @__PURE__ */ React.createElement("div", { style: { textAlign: "center" } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 28, marginBottom: 12 } }, "📋"), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 13, color: "#aaa" } }, "読み込んでいます…")));
    if (!authed) return /* @__PURE__ */ React.createElement(LockScreen, { isNew: isNewUser, onAuth: handleAuth, error: authError });
    const handleExport = () => {
      const mergedAm = { ...amByDate }, mergedPm = { ...pmByDate };
      dateCols.forEach((d, i) => {
        mergedAm[d.toDateString()] = amCols[i];
        mergedPm[d.toDateString()] = pmCols[i];
      });
      nextWeek1Cols.forEach((d, i) => {
        mergedAm[d.toDateString()] = amNext1[i];
        mergedPm[d.toDateString()] = pmNext1[i];
      });
      nextWeek2Cols.forEach((d, i) => {
        mergedAm[d.toDateString()] = amNext2[i];
        mergedPm[d.toDateString()] = pmNext2[i];
      });
      const exportData = {
        version: 2,
        user: urlUser,
        exportedAt: (/* @__PURE__ */ new Date()).toISOString(),
        inbox,
        amCols,
        pmCols,
        amByDate: mergedAm,
        pmByDate: mergedPm,
        doneIds: [...doneIds],
        routines,
        trash
      };
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `taskboard_${urlUser}_${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setShowSettings(false);
    };
    const handleImport = (e) => {
      var _a;
      const file = (_a = e.target.files) == null ? void 0 : _a[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        var _a2, _b, _c, _d, _e, _f, _g, _h, _i;
        try {
          if (typeof ((_a2 = ev.target) == null ? void 0 : _a2.result) !== "string") {
            alert("ファイル読み込みエラー");
            return;
          }
          const d = JSON.parse(ev.target.result);
          if (!d.version || !d.inbox) {
            alert("無効なバックアップファイルです");
            return;
          }
          if (d.user && d.user !== urlUser) {
            if (!window.confirm(`このバックアップは「${d.user}」のデータです。「${urlUser}」に上書きしますか？`)) return;
          }
          const abd = (_b = d.amByDate) != null ? _b : {}, pbd = (_c = d.pmByDate) != null ? _c : {};
          const hasDatedData = d.version >= 2 && Object.keys(abd).length > 0 && Object.keys(pbd).length > 0;
          setAmByDate(abd);
          setPmByDate(pbd);
          setInbox((_d = d.inbox) != null ? _d : []);
          setAmCols(hasDatedData ? dateCols.map((dt) => abd[dt.toDateString()] || []) : (_e = d.amCols) != null ? _e : dateCols.map(() => []));
          setPmCols(hasDatedData ? dateCols.map((dt) => pbd[dt.toDateString()] || []) : (_f = d.pmCols) != null ? _f : dateCols.map(() => []));
          setAmNext1(nextWeek1Cols.map((dt) => abd[dt.toDateString()] || []));
          setPmNext1(nextWeek1Cols.map((dt) => pbd[dt.toDateString()] || []));
          setAmNext2(nextWeek2Cols.map((dt) => abd[dt.toDateString()] || []));
          setPmNext2(nextWeek2Cols.map((dt) => pbd[dt.toDateString()] || []));
          setAmPrev1(prevWeek1Cols.map((dt) => abd[dt.toDateString()] || []));
          setPmPrev1(prevWeek1Cols.map((dt) => pbd[dt.toDateString()] || []));
          setAmPrev2(prevWeek2Cols.map((dt) => abd[dt.toDateString()] || []));
          setPmPrev2(prevWeek2Cols.map((dt) => pbd[dt.toDateString()] || []));
          setDoneIds(new Set((_g = d.doneIds) != null ? _g : []));
          setRoutines((_h = d.routines) != null ? _h : []);
          setTrash((_i = d.trash) != null ? _i : []);
          setShowSettings(false);
          alert("✅ バックアップを復元しました！");
        } catch {
          alert("ファイルの読み込みに失敗しました");
        }
      };
      reader.readAsText(file);
      e.target.value = "";
    };
    const boardContent = (() => {
      if (tab !== "board") return null;
      const { cols, am, pm } = getWeekData(boardWeek);
      const isReadOnly = boardWeek === -1 || boardWeek === -2;
      const wkAccents = [PINK, "#c9437a", "#be4280", "#b34186", "#a8408c", "#9e3f8e", "#934090"];
      const pastAccents = ["#aaa", "#999", "#888", "#888", "#999", "#aaa", "#bbb"];
      const colAccents = isReadOnly ? pastAccents : wkAccents;
      const isToday = (date) => date.toDateString() === TODAY.toDateString();
      if (isReadOnly) {
        if (layout === "stack") {
          return /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 12 } }, cols.map((date, i) => /* @__PURE__ */ React.createElement("div", { key: i, style: { ...FONT_STYLE, background: "#fff", border: "1.5px solid #e8e8e8", borderRadius: 14, padding: "12px", opacity: 0.88 } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 14, fontWeight: 700, color: "#888", marginBottom: 8 } }, fmtDate(date), "（", DAYS_JP[date.getDay()], "）"), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 6 } }, /* @__PURE__ */ React.createElement(ReadonlySlot, { isAm: true, todos: am[i], doneIds }), /* @__PURE__ */ React.createElement(ReadonlySlot, { isAm: false, todos: pm[i], doneIds })))));
        }
        return /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 12, overflowX: "auto", paddingBottom: 16, alignItems: "flex-start" } }, cols.map((date, i) => /* @__PURE__ */ React.createElement("div", { key: i, style: { minWidth: 240, width: 260, flexShrink: 0, ...FONT_STYLE, background: "#fff", border: "1.5px solid #e8e8e8", borderRadius: 14, padding: "12px", opacity: 0.88 } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 6, marginBottom: 10 } }, /* @__PURE__ */ React.createElement("div", { style: { width: 3, height: 14, background: colAccents[i], borderRadius: 2 } }), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 14, fontWeight: 700, color: "#888" } }, fmtDate(date), "（", DAYS_JP[date.getDay()], "）")), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 6 } }, /* @__PURE__ */ React.createElement(ReadonlySlot, { isAm: true, todos: am[i], doneIds }), /* @__PURE__ */ React.createElement(ReadonlySlot, { isAm: false, todos: pm[i], doneIds })))));
      }
      if (layout === "stack") {
        return /* @__PURE__ */ React.createElement("div", { style: { overflowY: "auto", WebkitOverflowScrolling: "touch", flex: 1, padding: "0 10px 32px", boxSizing: "border-box" } }, boardWeek === 0 && /* @__PURE__ */ React.createElement(QuickEntry, { onAdd: handleQuickAdd, dateCols: cols }), boardWeek !== 0 && /* @__PURE__ */ React.createElement("div", { style: { padding: "4px 0 6px", fontSize: 11, color: "#aaa" } }, isReadOnly ? "👁 閲覧のみ — 過去の記録" : ""), cols.map((date, i) => /* @__PURE__ */ React.createElement("div", { key: i, id: boardWeek === 0 && isToday(date) ? "day-col-0-today-stack" : void 0, style: { marginBottom: 14 } }, /* @__PURE__ */ React.createElement(DayColumn, { dayIndex: i, date, accent: isToday(date) ? PINK : colAccents[i], amTodos: am[i], pmTodos: pm[i], ...sp, onEdit: (t, c) => handleEdit(t, c), isToday: isToday(date) }))));
      }
      return /* @__PURE__ */ React.createElement("div", { style: { flex: 1, display: "flex", overflow: "hidden" } }, boardWeek === 0 && /* @__PURE__ */ React.createElement("div", { style: { width: 220, flexShrink: 0, display: "flex", flexDirection: "column", gap: 10, padding: "0 0 20px 0", borderRight: "1px solid #e8e8e8", overflowY: "auto" } }, /* @__PURE__ */ React.createElement(QuickEntry, { onAdd: handleQuickAdd, dateCols: cols })), /* @__PURE__ */ React.createElement("div", { style: { flex: 1, overflowX: "auto", overflowY: "auto", padding: "0 0 24px 14px", WebkitOverflowScrolling: "touch" } }, boardWeek === 0 && getTodayColIndex(cols) >= 0 && /* @__PURE__ */ React.createElement("div", { style: { display: "flex", justifyContent: "flex-end", marginBottom: 8 } }, /* @__PURE__ */ React.createElement("button", { onClick: () => {
        const el = document.getElementById(`day-col-${boardWeek}-today`);
        el == null ? void 0 : el.scrollIntoView({ behavior: "smooth", inline: "start", block: "nearest" });
      }, style: { ...FONT_STYLE, fontSize: 11, fontWeight: 700, color: PINK, background: PINK_LIGHT, border: `1px solid ${PINK}44`, borderRadius: 99, padding: "4px 12px", cursor: "pointer" } }, "📍 今日に戻る")), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 14, alignItems: "flex-start", paddingBottom: 16 } }, (boardWeek === 0 ? [...cols.filter((d) => d < TODAY && !isToday(d)), ...cols.filter((d) => d >= TODAY || isToday(d))] : cols).map((date) => {
        const i = cols.indexOf(date);
        const past = boardWeek === 0 && date < TODAY && !isToday(date);
        return /* @__PURE__ */ React.createElement("div", { key: i, id: isToday(date) ? `day-col-${boardWeek}-today` : `day-col-${boardWeek}-${i}`, style: { minWidth: 260, maxWidth: 300, width: 280, flexShrink: 0, opacity: past ? 0.7 : 1 } }, /* @__PURE__ */ React.createElement(DayColumn, { dayIndex: i, date, accent: isToday(date) ? PINK : colAccents[i], amTodos: am[i], pmTodos: pm[i], ...sp, onEdit: (t, c) => handleEdit(t, c), isToday: isToday(date) }));
      }))));
    })();
    return /* @__PURE__ */ React.createElement("div", { style: { ...FONT_STYLE, height: layout === "stack" ? "100dvh" : "auto", minHeight: layout === "stack" ? "unset" : "100vh", background: "#f5f6f8", display: layout === "stack" ? "flex" : "block", flexDirection: "column", overflow: "hidden", boxSizing: "border-box" } }, /* @__PURE__ */ React.createElement("div", { style: { marginBottom: layout === "stack" ? 10 : 16, padding: layout === "stack" ? "10px 10px 0" : "0", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0, flexWrap: layout === "stack" ? "wrap" : "nowrap", gap: 6 } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "baseline", gap: 20 } }, /* @__PURE__ */ React.createElement("h1", { style: { ...FONT_STYLE, margin: 0, fontSize: 20, fontWeight: 700, color: "#0d0d0d" } }, "Task Board"), /* @__PURE__ */ React.createElement("div", { style: { ...FONT_STYLE, fontSize: 13, color: "#0d0d0d" } }, (/* @__PURE__ */ new Date()).getFullYear(), "年", (/* @__PURE__ */ new Date()).getMonth() + 1, "月", (/* @__PURE__ */ new Date()).getDate(), "日 (", DAYS_JP[(/* @__PURE__ */ new Date()).getDay()], ")"), urlUser !== "main" && /* @__PURE__ */ React.createElement("div", { style: { ...FONT_STYLE, fontSize: 11, fontWeight: 700, color: "#fff", background: PINK, borderRadius: 20, padding: "2px 10px" } }, urlUser)), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8 } }, layout !== "stack" && [["board", "📋 ボード"], ["inbox", "📥 ストック"], ["routines", "🔁 管理"], ["trash", "🗑"], ["guide", "📖"]].map(([key, label]) => /* @__PURE__ */ React.createElement("button", { key, onClick: () => setTab(key), style: { ...FONT_STYLE, padding: "5px 11px", borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: "pointer", border: "1.5px solid", position: "relative", flexShrink: 0, background: tab === key ? "#0d0d0d" : "#fff", color: tab === key ? "#fff" : "#555", borderColor: tab === key ? "#0d0d0d" : "#e0e0e0" } }, label, key === "inbox" && inbox.length > 0 && badge(inbox.length, PINK), key === "routines" && routines.filter((r) => r.active).length > 0 && badge(routines.filter((r) => r.active).length, "#555"), key === "trash" && trash.length > 0 && badge(trash.length, "#aaa"))), layout !== "stack" && /* @__PURE__ */ React.createElement("div", { style: { width: 1, height: 20, background: "#e0e0e0", margin: "0 2px" } }), /* @__PURE__ */ React.createElement("div", { style: { ...FONT_STYLE, fontSize: 12, color: saveError ? "#cc3333" : saveFlash ? "#1b7a3a" : "#ccc", transition: "color .4s" } }, saveError ? "⚠️" : saveFlash ? "✓" : ""), /* @__PURE__ */ React.createElement("button", { onClick: () => setShowSettings(true), style: { background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "#aaa", padding: "4px", lineHeight: 1 }, title: "バックアップ・設定" }, "⚙️"))), showSettings && /* @__PURE__ */ React.createElement("div", { style: { position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 3e3 }, onClick: () => setShowSettings(false) }, /* @__PURE__ */ React.createElement("div", { style: { ...FONT_STYLE, background: "#fff", borderRadius: "20px 20px 0 0", padding: "24px 20px 40px", width: "100%", maxWidth: 480, boxShadow: "0 -4px 24px rgba(0,0,0,.12)" }, onClick: (e) => e.stopPropagation() }, /* @__PURE__ */ React.createElement("div", { style: { width: 40, height: 4, background: "#ddd", borderRadius: 2, margin: "0 auto 20px" } }), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 15, fontWeight: 700, color: "#0d0d0d", marginBottom: 6 } }, "⚙️ バックアップ・設定"), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 12, color: "#aaa", marginBottom: 20 } }, "データをJSONファイルで保存・復元できます"), /* @__PURE__ */ React.createElement("div", { style: { background: "#f2faf2", border: "1.5px solid #8ed08e", borderRadius: 12, padding: "16px", marginBottom: 12 } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 13, fontWeight: 700, color: "#2a6e2a", marginBottom: 4 } }, "💾 バックアップを保存"), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, color: "#888", marginBottom: 12 } }, "現在のデータをJSONファイルとしてダウンロードします"), /* @__PURE__ */ React.createElement("button", { onClick: handleExport, style: { ...FONT_STYLE, width: "100%", padding: "10px", background: "#3a9e3a", color: "#fff", fontWeight: 700, fontSize: 13, borderRadius: 8, border: "none", cursor: "pointer" } }, "⬇️ ダウンロード（", (/* @__PURE__ */ new Date()).toISOString().slice(0, 10), "）")), /* @__PURE__ */ React.createElement("div", { style: { background: "#fff8f0", border: "1.5px solid #f5a55a", borderRadius: 12, padding: "16px", marginBottom: 20 } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 13, fontWeight: 700, color: "#a04010", marginBottom: 4 } }, "📂 バックアップから復元"), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, color: "#888", marginBottom: 12 } }, "⚠️ 現在のデータはバックアップファイルで上書きされます"), /* @__PURE__ */ React.createElement("button", { onClick: () => {
      var _a;
      return (_a = importRef.current) == null ? void 0 : _a.click();
    }, style: { ...FONT_STYLE, width: "100%", padding: "10px", background: "#e06010", color: "#fff", fontWeight: 700, fontSize: 13, borderRadius: 8, border: "none", cursor: "pointer" } }, "⬆️ ファイルを選択して復元"), /* @__PURE__ */ React.createElement("input", { ref: importRef, type: "file", accept: ".json", onChange: handleImport, style: { display: "none" } })), /* @__PURE__ */ React.createElement("button", { onClick: () => setShowSettings(false), style: { ...FONT_STYLE, width: "100%", padding: "11px", background: "#f5f5f5", border: "1.5px solid #e0e0e0", borderRadius: 8, fontSize: 14, fontWeight: 700, color: "#666", cursor: "pointer" } }, "閉じる"))), layout === "stack" && /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 6, marginBottom: tab === "board" ? 6 : 16, overflowX: "auto", WebkitOverflowScrolling: "touch", scrollbarWidth: "none", msOverflowStyle: "none", flexShrink: 0, padding: "0 12px" } }, [["board", "📋"], ["inbox", "📥"], ["routines", "🔁"], ["trash", "🗑"], ["guide", "📖"]].map(([key, icon]) => /* @__PURE__ */ React.createElement("button", { key, onClick: () => setTab(key), style: { ...FONT_STYLE, padding: "7px 13px", borderRadius: 8, fontSize: 16, cursor: "pointer", border: "1.5px solid", flexShrink: 0, position: "relative", background: tab === key ? "#0d0d0d" : "#fff", color: tab === key ? "#fff" : "#555", borderColor: tab === key ? "#0d0d0d" : "#e0e0e0" } }, icon, key === "routines" && routines.filter((r) => r.active).length > 0 && badge(routines.filter((r) => r.active).length, "#555"), key === "trash" && trash.length > 0 && badge(trash.length, "#aaa")))), tab === "board" && /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 6, marginBottom: layout === "stack" ? 12 : 8, overflowX: "auto", WebkitOverflowScrolling: "touch", scrollbarWidth: "none", msOverflowStyle: "none", flexShrink: 0, padding: layout === "stack" ? "0 12px" : "0" } }, [[0, "今週", false], [1, "来週", false], [2, "再来週", false], [-1, "先週", true], [-2, "先々週", true]].map(([w, label, readOnly]) => {
      const isActive = boardWeek === w;
      return /* @__PURE__ */ React.createElement("button", { key: w, onClick: () => setBoardWeek(w), style: {
        ...FONT_STYLE,
        padding: "5px 14px",
        borderRadius: 20,
        fontSize: 12,
        fontWeight: 700,
        cursor: "pointer",
        border: "1.5px solid",
        flexShrink: 0,
        background: isActive ? readOnly ? "#888" : PINK : "#fff",
        color: isActive ? "#fff" : readOnly ? "#aaa" : "#555",
        borderColor: isActive ? readOnly ? "#888" : PINK : readOnly ? "#e8e8e8" : "#e0e0e0"
      } }, w === 0 ? "🗓 今週" : label);
    }), (boardWeek === -1 || boardWeek === -2) && /* @__PURE__ */ React.createElement("span", { style: { ...FONT_STYLE, fontSize: 11, color: "#aaa", alignSelf: "center" } }, "👁 閲覧のみ")), tab === "guide" ? /* @__PURE__ */ React.createElement("div", { style: { flex: layout === "stack" ? 1 : "unset", overflowY: layout === "stack" ? "auto" : "visible", padding: layout === "stack" ? "0 12px 24px" : "0" } }, /* @__PURE__ */ React.createElement(QuickGuide, null)) : tab === "trash" ? /* @__PURE__ */ React.createElement("div", { style: { flex: layout === "stack" ? 1 : "unset", overflowY: layout === "stack" ? "auto" : "visible", padding: layout === "stack" ? "0 12px 24px" : "0" } }, /* @__PURE__ */ React.createElement(TrashBin, { trash, onRestore: handleRestore, onPermanentDelete: (id) => setTrash((p) => p.filter((t) => t.id !== id)), onClearAll: () => setTrash([]) })) : tab === "routines" ? /* @__PURE__ */ React.createElement("div", { style: { flex: layout === "stack" ? 1 : "unset", overflowY: layout === "stack" ? "auto" : "visible", padding: layout === "stack" ? "0 12px 24px" : "0" } }, /* @__PURE__ */ React.createElement(RoutineManager, { routines, onAdd: handleAddRoutine, onUpdate: handleUpdateRoutine, onDelete: handleDeleteRoutine, onToggle: handleToggleRoutine })) : tab === "inbox" ? /* @__PURE__ */ React.createElement("div", { style: { flex: layout === "stack" ? 1 : "unset", overflowY: layout === "stack" ? "auto" : "visible", padding: layout === "stack" ? "0 12px 24px" : "0" } }, /* @__PURE__ */ React.createElement(InboxPage, { todos: inbox, ...sp, onAdd: () => handleAdd("inbox"), onQuickAdd: handleQuickAdd, dateCols })) : boardContent, layout !== "stack" && /* @__PURE__ */ React.createElement("div", { style: { ...FONT_STYLE, marginTop: 14, fontSize: 11, color: "#bbb" } }, "💡 ✏️ 編集から重要マーク設定、ドラッグハンドルで並び替えができます"), showModal && editTodo && /* @__PURE__ */ React.createElement(EditModal, { todo: editTodo.todo, onSave: handleSave, onClose: () => {
      setShowModal(false);
      setEditTodo(null);
    } }));
  }
  ReactDOM.createRoot(document.getElementById("root")).render(/* @__PURE__ */ React.createElement(App, null));
})();
