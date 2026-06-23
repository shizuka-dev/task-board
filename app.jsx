const { useState, useRef, useEffect, useCallback, useMemo } = React;

// ── Supabase & User ───────────────────────────────────────────────────────────
const _sb = window.supabase.createClient(
  "https://vfzbrnhakjefokunwjmg.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZmemJybmhha2plZm9rdW53am1nIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkwMTc1MjUsImV4cCI6MjA5NDU5MzUyNX0.uvu3_kXh9_M0mpzaG2aK8ID36QAHBjiQc6qnVPuqD2I"
);
const rawUser = new URLSearchParams(window.location.search).get("user") || "main";
const urlUser = rawUser.replace(/[^a-zA-Z0-9_]/g, "").slice(0, 32) || "main";
const DB_ROW_ID = `user_${urlUser}`;
const THREE_DAYS = 3 * 24 * 60 * 60 * 1000;

async function hashPassword(pw) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw", enc.encode(pw), "PBKDF2", false, ["deriveBits"]
  );
  const buf = await crypto.subtle.deriveBits(
    { name:"PBKDF2", salt:enc.encode(urlUser + "taskboard_salt_2024"), iterations:100000, hash:"SHA-256" },
    keyMaterial, 256
  );
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,"0")).join("");
}

// ── Persistence ───────────────────────────────────────────────────────────────
async function loadState(dateCols) {
  try {
    const { data, error } = await _sb.from("todos").select("data, password_hash").eq("id", DB_ROW_ID).single();
    if (error) {
      if (error.code === "PGRST116") return null;
      console.error("loadState DB error:", error);
      return { loadError: true };
    }
    if (!data) return null;
    const s = data?.data ?? {};
    const now = Date.now();
    return {
      inbox:        s.inbox ?? [],
      amCols:       dateCols.map(d => s.amByDate?.[d.toDateString()] ?? []),
      pmCols:       dateCols.map(d => s.pmByDate?.[d.toDateString()] ?? []),
      amByDate:     s.amByDate ?? {},
      pmByDate:     s.pmByDate ?? {},
      doneIds:      new Set(s.doneIds ?? []),
      routines:     s.routines ?? [],
      trash:        (s.trash ?? []).filter(t => now - t.deletedAt < THREE_DAYS),
      passwordHash: data.password_hash ?? null,
    };
  } catch(e) {
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
      try {
        const amByDate = { ...(state.amByDate ?? {}) };
        const pmByDate = { ...(state.pmByDate ?? {}) };
        dateCols.forEach((d,i) => { amByDate[d.toDateString()] = state.amCols[i]; pmByDate[d.toDateString()] = state.pmCols[i]; });
        if (state.extraWeeks) {
          state.extraWeeks.forEach(({cols,am,pm}) => {
            cols.forEach((d,i) => { amByDate[d.toDateString()] = am[i]; pmByDate[d.toDateString()] = pm[i]; });
          });
        }
        const { error } = await _sb.from("todos").upsert({
          id: DB_ROW_ID,
          password_hash: state.passwordHash ?? null,
          data: { inbox: state.inbox, amByDate, pmByDate, doneIds: [...state.doneIds], routines: state.routines, trash: state.trash, savedAt: Date.now() },
          updated_at: new Date().toISOString(),
        });
        if (error) throw error;
        if (version===_saveVersion) onSuccess?.();
      } catch(e) {
        console.error("save error", e);
        if (version===_saveVersion) onError?.();
      }
    });
  }, 800);
}

// ── Constants & Helpers ───────────────────────────────────────────────────────
const PINK = "#d4457a", PINK_LIGHT = "#fce8f1", PINK_TEXT = "#b03468";
const AM_BG = "#f2faf2", AM_BORDER = "#8ed08e", AM_ACCENT = "#3a9e3a", AM_LIGHT = "#e4f5e4", AM_TEXT = "#2a6e2a", AM_HEAD = "#2e8c2e";
const PM_BG = "#fff6ee", PM_BORDER = "#f5a55a", PM_ACCENT = "#e06010", PM_LIGHT = "#feebd8", PM_TEXT = "#a04010", PM_HEAD = "#d05c10";
const FONT_STYLE = { fontFamily: "'Noto Sans JP', 'Hiragino Sans', sans-serif" };
const DAYS_JP = ["日","月","火","水","木","金","土"];

function getWeekDateCols(weekOffset) {
  const t = new Date(); t.setHours(0,0,0,0);
  const dow = t.getDay();
  const monday = new Date(t);
  monday.setDate(t.getDate() - ((dow + 6) % 7) + weekOffset * 7);
  return Array.from({length:7}, (_,i) => { const d = new Date(monday); d.setDate(monday.getDate()+i); return d; });
}
function getTodayColIndex(dateCols) {
  const today = new Date(); today.setHours(0,0,0,0);
  return dateCols.findIndex(d => d.toDateString() === today.toDateString());
}
function fmtDate(d) { return `${d.getMonth()+1}/${d.getDate()}`; }
function getDayLabel(i, date) {
  if (!date) { return i===0?"今日":i===1?"明日":i===2?"明後日":`${i}日後`; }
  const t=new Date(); t.setHours(0,0,0,0);
  const diff=Math.round((date-t)/86400000);
  if (diff===0) return "今日";
  if (diff===1) return "明日";
  if (diff===2) return "明後日";
  if (diff===-1) return "昨日";
  if (diff<0) return `${-diff}日前`;
  return fmtDate(date);
}
function genId() { return typeof crypto.randomUUID === "function" ? crypto.randomUUID() : ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g,c=>(c^crypto.getRandomValues(new Uint8Array(1))[0]&15>>c/4).toString(16)); }
function stampTodo(t) { return { createdAt: Date.now(), lastCheckedAt: null, ...t }; }
function routineLabel(r) {
  if (!r) return null;
  if (r.type==="daily") return "毎日";
  if (r.type==="weekly") return "毎週 " + r.days.map(d => DAYS_JP[d]).join("・");
  if (r.type==="nweekly") return `${r.interval}週に1回`;
  if (r.type==="ndaily") return `${r.interval}日毎`;
  if (r.type==="monthly") return `毎月 ${r.day}日`;
  if (r.type==="date") return `${r.month}/${r.day}`;
  return null;
}

// ── Natural Language Parser ───────────────────────────────────────────────────
const DAY_MAP = {"日曜日":0,"日曜":0,"月曜日":1,"月曜":1,"火曜日":2,"火曜":2,"水曜日":3,"水曜":3,"木曜日":4,"木曜":4,"金曜日":5,"金曜":5,"土曜日":6,"土曜":6,"日":0,"月":1,"火":2,"水":3,"木":4,"金":5,"土":6};
// ソート済みキーをモジュールトップで一度だけ計算（parseLine呼び出しごとの再計算を防ぐ）
const DAY_MAP_KEYS = Object.keys(DAY_MAP).sort((a,b) => b.length-a.length);
function extractDays(str) {
  const days = [];
  let rem = str;
  while (rem.length > 0) {
    const k = DAY_MAP_KEYS.find(k => rem.startsWith(k));
    if (k) { if (!days.includes(DAY_MAP[k])) days.push(DAY_MAP[k]); rem = rem.slice(k.length).replace(/^[・,、\s]+/,""); }
    else rem = rem.slice(1);
  }
  return days;
}
function parseLine(raw) {
  try {
    let line = raw.trim(); if (!line) return null;
    let routine = null, slotHint = null;

    if (/^(AM|午前)\s*/i.test(line)) { slotHint="am"; line=line.replace(/^(AM|午前)\s*/i,""); }
    else if (/^(PM|午後)\s*/i.test(line)) { slotHint="pm"; line=line.replace(/^(PM|午後)\s*/i,""); }

    if (/(今日|本日)/.test(line)) { routine={type:"relative",offset:0}; line=line.replace(/(今日|本日)/g,""); }
    else if (/明後々日|明々後日/.test(line)) { routine={type:"relative",offset:3}; line=line.replace(/明後々日|明々後日/g,""); }
    else if (/明後日/.test(line)) { routine={type:"relative",offset:2}; line=line.replace(/明後日/g,""); }
    else if (/明日/.test(line)) { routine={type:"relative",offset:1}; line=line.replace(/明日/g,""); }

    if (!routine && /毎日/.test(line)) { routine={type:"daily"}; line=line.replace(/毎日/g,""); }
    if (!routine) { const m=line.match(/毎月\s*(\d{1,2})\s*日?/); if(m){routine={type:"monthly",day:+m[1]};line=line.replace(m[0],"");} }
    if (!routine) { const m=line.match(/(\d{1,2})[\/\-](\d{1,2})/)||line.match(/(\d{1,2})月(\d{1,2})日/); if(m){routine={type:"date",month:+m[1],day:+m[2]};line=line.replace(m[0],"");} }
    // N日毎（3日毎、10日毎など）
    if (!routine) { const m=line.match(/([0-9０-９]+)\s*日(?:毎|ごと)/); if(m){ const n=parseInt(m[1].replace(/[０-９]/g,s=>String.fromCharCode(s.charCodeAt(0)-0xFEE0))); if(n>=2){routine={type:"ndaily",interval:n,startDate:new Date().toDateString()};line=line.replace(m[0],"");} } }
    // N週に1回（2週・3週など）
    if (!routine) { const m=line.match(/([2-9２-９]|[1１][0-9０-９]?)\s*週/); if(m){ const n=parseInt(m[1].replace(/[０-９]/g,s=>String.fromCharCode(s.charCodeAt(0)-0xFEE0))); routine={type:"nweekly",interval:n,startDate:new Date().toDateString()}; line=line.replace(m[0],""); } }
    if (!routine) { const m=line.match(/毎週\s*([^\s,、。\d]+)/); if(m){const d=extractDays(m[1]);if(d.length){routine={type:"weekly",days:d.sort()};line=line.replace(m[0],"");}}}
    if (!routine) { const m=line.match(/毎([月火水木金土日][曜日]?(?:[・,、]?[月火水木金土日][曜日]?)*)/); if(m){const d=extractDays(m[1]);if(d.length){routine={type:"weekly",days:d.sort()};line=line.replace(m[0],"");}}}

    if (!slotHint) {
      if (/(^|\s)(AM|午前)(\s|$)/i.test(line)) { slotHint="am"; line=line.replace(/(^|\s)(AM|午前)(\s|$)/ig," "); }
      else if (/(^|\s)(PM|午後)(\s|$)/i.test(line)) { slotHint="pm"; line=line.replace(/(^|\s)(PM|午後)(\s|$)/ig," "); }
    }

    line = line.replace(/[,、。・]+/g," ").replace(/\s+/g," ").trim();
    if (!line) return null;
    return { text:line, routine, slotHint };
  } catch(e) {
    console.warn("parseLine error:", e, raw);
    const text = raw.trim();
    return text ? { text, routine:null, slotHint:null } : null;
  }
}
function previewLines(raw) { return raw.split("\n").map(l => ({ original:l, parsed:parseLine(l) })); }

// colId → 配列（weeklyは複数）
function resolveColIds(todo, dateCols) {
  const r = todo.routine; if (!r) return null;
  const slot = todo.slotHint==="pm" ? "pm" : "am";
  if (r.type==="relative") { const i=r.offset; return i>=0&&i<dateCols.length?[`d${i}-${slot}`]:null; }
  if (r.type==="daily") return dateCols.map((_,i)=>`d${i}-${slot}`);
  if (r.type==="weekly") { const c=[]; for(let i=0;i<dateCols.length;i++) if(r.days.includes(dateCols[i].getDay())) c.push(`d${i}-${slot}`); return c.length?c:null; }
  if (r.type==="nweekly") {
    const start=new Date(r.startDate); start.setHours(0,0,0,0);
    const monday=new Date(dateCols[0]); monday.setHours(0,0,0,0);
    const diffWeeks=Math.round((monday-start)/(7*24*60*60*1000));
    if(diffWeeks>=0&&diffWeeks%r.interval===0){
      const dow=start.getDay(); const colIdx=dateCols.findIndex(d=>d.getDay()===dow); const idx=colIdx>=0?colIdx:0;
      return [`d${idx}-${slot}`];
    }
    return null;
  }
  if (r.type==="ndaily") {
    const start=new Date(r.startDate); start.setHours(0,0,0,0);
    const cols=[];
    for(let i=0;i<dateCols.length;i++){
      const diff=Math.round((dateCols[i]-start)/(24*60*60*1000));
      if(diff>=0&&diff%r.interval===0) cols.push(`d${i}-${slot}`);
    }
    return cols.length?cols:null;
  }
  if (r.type==="monthly") { for(let i=0;i<dateCols.length;i++) if(dateCols[i].getDate()===r.day) return[`d${i}-${slot}`]; return null; }
  if (r.type==="date") { for(let i=0;i<dateCols.length;i++) if(dateCols[i].getMonth()+1===r.month&&dateCols[i].getDate()===r.day) return[`d${i}-${slot}`]; return null; }
  return null;
}

// ルーティン定義から今週分を自動生成
function autoGenerateFromDefinitions(amCols, pmCols, routines, dateCols) {
  if (!routines.length) return { amCols, pmCols };
  const today = new Date(); today.setHours(0,0,0,0);
  const newAm = amCols.map(c=>[...c]), newPm = pmCols.map(c=>[...c]);
  routines.forEach(def => {
    if (!def.active) return;
    if (def.expiresAt) { const exp=new Date(def.expiresAt); exp.setHours(23,59,59,999); if(today>exp) return; }
    const colIds = resolveColIds(def, dateCols); if (!colIds) return;
    colIds.forEach(colId => {
      const m = colId.match(/^d(\d+)-(am|pm)$/); if (!m) return;
      const di=+m[1], isAm=m[2]==="am";
      const col = isAm ? newAm[di] : newPm[di];
      if (col.some(t => t.routineDefId===def.id)) return;
      const task = stampTodo({
        id: genId(),
        text: def.text,
        routine: def.routine,
        slotHint: def.slotHint,
        routineDefId: def.id,
        lastCheckedAt: null,
        createdAt: Date.now(),
      });
      if (isAm) newAm[di]=[...newAm[di],task]; else newPm[di]=[...newPm[di],task];
    });
  });
  return { amCols:newAm, pmCols:newPm };
}

// 1件のルーティン定義だけを差分反映し、同じ列にある既存タスクのIDを維持する
function syncRoutineDefinition(amCols, pmCols, def, dateCols) {
  const existingByCol = new Map(), oldIds = new Set();
  amCols.forEach((col,i) => col.forEach(t => {
    if (t.routineDefId===def.id) { existingByCol.set(`d${i}-am`,t); oldIds.add(t.id); }
  }));
  pmCols.forEach((col,i) => col.forEach(t => {
    if (t.routineDefId===def.id) { existingByCol.set(`d${i}-pm`,t); oldIds.add(t.id); }
  }));

  const newAm=amCols.map(col=>col.filter(t=>t.routineDefId!==def.id));
  const newPm=pmCols.map(col=>col.filter(t=>t.routineDefId!==def.id));
  const today=new Date(); today.setHours(0,0,0,0);
  const expired=def.expiresAt && new Date(`${def.expiresAt}T23:59:59`) < today;
  const colIds=def.active&&!expired ? (resolveColIds(def,dateCols) ?? []) : [];
  const keptIds=new Set();

  colIds.forEach(colId => {
    const m=colId.match(/^d(\d+)-(am|pm)$/); if(!m) return;
    const di=+m[1], isAm=m[2]==="am", existing=existingByCol.get(colId);
    const task=existing
      ? {...existing,text:def.text,routine:def.routine,slotHint:def.slotHint,routineDefId:def.id}
      : stampTodo({id:genId(),text:def.text,routine:def.routine,slotHint:def.slotHint,routineDefId:def.id});
    keptIds.add(task.id);
    if(isAm) newAm[di]=[...newAm[di],task]; else newPm[di]=[...newPm[di],task];
  });

  return {amCols:newAm,pmCols:newPm,removedIds:[...oldIds].filter(id=>!keptIds.has(id))};
}

// ── Sort Drag（列内並び替え専用）──────────────────────────────────────────────
function useSortDrag({ onReorder }) {
  const drag=useRef(null), ghost=useRef(null), overIdx=useRef(null), timer=useRef(null), start=useRef(null), active=useRef(false);
  const cleanup = useCallback(() => {
    clearTimeout(timer.current);
    ghost.current?.remove(); ghost.current=null;
    drag.current=null; active.current=false; overIdx.current=null;
    document.body.style.overflow="";
    document.querySelectorAll("[data-sort-over]").forEach(el=>el.removeAttribute("data-sort-over"));
  }, []);
  const onDragStart = useCallback((e, colId, idx) => {
    drag.current={colId,idx}; e.dataTransfer.effectAllowed="move";
  }, []);
  const onDragOver = useCallback((e, colId, idx) => {
    e.preventDefault();
    if (!drag.current||drag.current.colId!==colId) return;
    overIdx.current=idx;
    document.querySelectorAll("[data-sort-over]").forEach(el=>el.removeAttribute("data-sort-over"));
    e.currentTarget.setAttribute("data-sort-over","true");
  }, []);
  const onDragEnd = useCallback(() => {
    if (drag.current&&overIdx.current!==null&&overIdx.current!==drag.current.idx)
      onReorder(drag.current.colId, drag.current.idx, overIdx.current);
    cleanup();
  }, [onReorder, cleanup]);
  const spawnGhost = useCallback((el, cx, cy) => {
    const r=el.getBoundingClientRect(), clone=el.cloneNode(true);
    clone.style.cssText=`position:fixed;left:${r.left}px;top:${r.top}px;width:${r.width}px;opacity:.82;pointer-events:none;z-index:9999;border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.2);transform:scale(1.03);margin:0`;
    document.body.appendChild(clone);
    ghost.current={el:clone, offsetX:cx-r.left, offsetY:cy-r.top};
  }, []);
  const onTouchStart = useCallback((e, colId, idx, cardEl) => {
    const t=e.touches[0]; start.current={x:t.clientX,y:t.clientY};
    drag.current={colId,idx,srcEl:cardEl};
    timer.current=setTimeout(()=>{
      if (!drag.current) return;
      active.current=true; document.body.style.overflow="hidden";
      spawnGhost(drag.current.srcEl, start.current.x, start.current.y);
    }, 280);
  }, [spawnGhost]);
  const onTouchMove = useCallback((e) => {
    if (!drag.current) return;
    const t=e.touches[0];
    if (!active.current) {
      const dx=t.clientX-start.current.x, dy=t.clientY-start.current.y;
      if (Math.sqrt(dx*dx+dy*dy)>8) { cleanup(); return; }
      return;
    }
    if (e.cancelable) e.preventDefault();
    e.stopPropagation();
    if (ghost.current) { ghost.current.el.style.left=`${t.clientX-ghost.current.offsetX}px`; ghost.current.el.style.top=`${t.clientY-ghost.current.offsetY}px`; }
    ghost.current.el.style.visibility="hidden";
    const el=document.elementFromPoint(t.clientX,t.clientY);
    ghost.current.el.style.visibility="";
    const card=el?.closest("[data-sort-idx]");
    document.querySelectorAll("[data-sort-over]").forEach(el=>el.removeAttribute("data-sort-over"));
    if (card) {
      // 別の列のカード上では並び替え対象にしない（誤splice防止。クロス列移動は未実装）
      const colEl=card.closest("[data-colid]");
      if (colEl && colEl.dataset.colid!==drag.current.colId) { overIdx.current=null; return; }
      overIdx.current=+card.dataset.sortIdx; card.setAttribute("data-sort-over","true");
    }
  }, [cleanup]);
  const onTouchEnd = useCallback(() => {
    clearTimeout(timer.current);
    if (!active.current||!drag.current) { cleanup(); return; }
    if (overIdx.current!==null&&overIdx.current!==drag.current.idx)
      onReorder(drag.current.colId, drag.current.idx, overIdx.current);
    cleanup();
  }, [onReorder, cleanup]);
  return { onDragStart, onDragOver, onDragEnd, onTouchStart, onTouchMove, onTouchEnd };
}

// ── Components ────────────────────────────────────────────────────────────────

function LockScreen({ isNew, onAuth, error }) {
  const [pw, setPw]=useState(""), [pw2, setPw2]=useState(""), [show, setShow]=useState(false);
  const submit = () => onAuth(pw, pw2);
  return (
    <div style={{minHeight:"100vh",background:"#f5f6f8",display:"flex",alignItems:"center",justifyContent:"center",padding:20,...FONT_STYLE}}>
      <div style={{background:"#fff",borderRadius:20,padding:"36px 28px",width:"100%",maxWidth:360,boxShadow:"0 4px 24px rgba(0,0,0,.08)"}}>
        <div style={{textAlign:"center",marginBottom:28}}>
          <div style={{fontSize:36,marginBottom:10}}>🔐</div>
          <div style={{fontSize:18,fontWeight:700,color:"#0d0d0d",marginBottom:6}}>{isNew?"パスワードを設定":"Task Board"}</div>
          <div style={{fontSize:12,color:"#aaa"}}>{isNew?`${urlUser} の初回設定`:`${urlUser} のボード`}</div>
        </div>
        <div style={{marginBottom:14}}>
          <div style={{fontSize:11,fontWeight:700,color:"#aaa",marginBottom:6}}>{isNew?"新しいパスワード":"パスワード"}</div>
          <div style={{position:"relative"}}>
            <input type={show?"text":"password"} value={pw} onChange={e=>setPw(e.target.value)} onKeyDown={e=>e.key==="Enter"&&submit()} autoFocus placeholder="パスワードを入力"
              style={{width:"100%",padding:"12px 44px 12px 14px",fontSize:15,border:"1.5px solid #e0e0e0",borderRadius:10,outline:"none",boxSizing:"border-box",...FONT_STYLE}}/>
            <button onClick={()=>setShow(p=>!p)} style={{position:"absolute",right:12,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",cursor:"pointer",fontSize:16,color:"#aaa"}}>{show?"🙈":"👁"}</button>
          </div>
        </div>
        {isNew && (
          <div style={{marginBottom:14}}>
            <div style={{fontSize:11,fontWeight:700,color:"#aaa",marginBottom:6}}>パスワード（確認）</div>
            <input type={show?"text":"password"} value={pw2} onChange={e=>setPw2(e.target.value)} onKeyDown={e=>e.key==="Enter"&&submit()} placeholder="もう一度入力"
              style={{width:"100%",padding:"12px 14px",fontSize:15,border:"1.5px solid #e0e0e0",borderRadius:10,outline:"none",boxSizing:"border-box",...FONT_STYLE}}/>
          </div>
        )}
        {error && <div style={{fontSize:12,color:"#cc3333",marginBottom:12,textAlign:"center"}}>{error}</div>}
        <button onClick={submit} style={{width:"100%",padding:13,background:"#0d0d0d",color:"#fff",fontWeight:700,fontSize:15,borderRadius:10,border:"none",cursor:"pointer",...FONT_STYLE}}>
          {isNew?"設定して始める":"ログイン"}
        </button>
      </div>
    </div>
  );
}

function EditModal({ todo, onSave, onClose }) {
  const [text,setText]=useState(todo?.text||"");
  const [rtype,setRtype]=useState(todo?.routine?.type||"none");
  const [wdays,setWdays]=useState(todo?.routine?.days||[]);
  const [mday,setMday]=useState(todo?.routine?.day||1);
  const [dm,setDm]=useState(todo?.routine?.month||new Date().getMonth()+1);
  const [dd,setDd]=useState(todo?.routine?.day||new Date().getDate());
  const [slotHint,setSlotHint]=useState(todo?.slotHint||"am");
  const [important,setImportant]=useState(!!todo?.important);
  const togDay = d => setWdays(p => p.includes(d)?p.filter(x=>x!==d):[...p,d].sort());
  const KNOWN_RTYPES=["none","daily","weekly","monthly","date"];
  const save = () => {
    if (!text.trim()) return;
    let routine=null;
    if (rtype==="daily") routine={type:"daily"};
    else if (rtype==="weekly") routine={type:"weekly",days:wdays};
    else if (rtype==="monthly") routine={type:"monthly",day:mday};
    else if (rtype==="date") routine={type:"date",month:dm,day:dd};
    else if (rtype!=="none") routine=todo?.routine??null; // nweekly/ndaily等この画面で編集できないタイプは温存
    onSave({...todo, text:text.trim(), routine, slotHint:rtype==="none"?null:slotHint, important});
  };
  const IMP_RED="#E24B4A";
  const inp={...FONT_STYLE,background:"#f7f7f7",border:"1.5px solid #e0e0e0",borderRadius:6,color:"#111",padding:"8px 10px",fontSize:14,outline:"none",textAlign:"center"};
  const btn=(active)=>({...FONT_STYLE,padding:"7px 16px",borderRadius:6,fontSize:13,cursor:"pointer",fontWeight:700,background:active?"#0d0d0d":"#f5f5f5",border:`1.5px solid ${active?"#0d0d0d":"#ddd"}`,color:active?"#fff":"#555"});
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.45)",display:"flex",alignItems:"flex-end",justifyContent:"center",zIndex:2000}} onClick={onClose}>
      <div style={{...FONT_STYLE,background:"#fff",borderRadius:"20px 20px 0 0",padding:"24px 20px",paddingBottom:"calc(28px + env(safe-area-inset-bottom))",width:"100%",maxWidth:520,maxHeight:"92dvh",overflowY:"auto",boxShadow:"0 -4px 24px rgba(0,0,0,.12)"}} onClick={e=>e.stopPropagation()}>
        <div style={{width:40,height:4,background:"#ddd",borderRadius:2,margin:"0 auto 20px"}}/>
        <div style={{fontSize:12,fontWeight:700,color:PINK,marginBottom:14}}>{todo?.id?"タスクを編集":"新しいタスク"}</div>
        <textarea value={text} onChange={e=>setText(e.target.value)} autoFocus placeholder="タスクの内容..."
          style={{...FONT_STYLE,width:"100%",background:"#f7f7f7",border:"1.5px solid #e0e0e0",borderRadius:8,color:"#111",padding:"12px 14px",fontSize:16,resize:"none",minHeight:70,outline:"none",boxSizing:"border-box"}}/>
        {/* 重要トグル */}
        <div onClick={()=>setImportant(p=>!p)}
          style={{marginTop:14,display:"flex",alignItems:"center",gap:12,padding:"12px 14px",borderRadius:10,cursor:"pointer",background:important?"#FCEBEB":"#f7f7f7",border:`1.5px solid ${important?IMP_RED:"#e0e0e0"}`,transition:"all .15s"}}>
          <div style={{width:36,height:20,borderRadius:10,background:important?IMP_RED:"#ddd",position:"relative",transition:"background .2s",flexShrink:0}}>
            <div style={{position:"absolute",top:2,left:important?18:2,width:16,height:16,borderRadius:"50%",background:"#fff",transition:"left .2s"}}/>
          </div>
          <div>
            <div style={{...FONT_STYLE,fontSize:13,fontWeight:700,color:important?IMP_RED:"#555"}}>‼️ 重要タスク</div>
            <div style={{...FONT_STYLE,fontSize:11,color:"#aaa",marginTop:1}}>ONにすると赤枠で強調・先頭に表示</div>
          </div>
        </div>
        <div style={{marginTop:16}}>
          <div style={{fontSize:11,fontWeight:700,color:"#aaa",marginBottom:10}}>ルーティン設定</div>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            {[["none","なし"],["daily","毎日"],["weekly","毎週"],["monthly","毎月"],["date","日付指定"]].map(([v,l])=>(
              <button key={v} onClick={()=>setRtype(v)} style={btn(rtype===v)}>{l}</button>
            ))}
            {!KNOWN_RTYPES.includes(rtype) && <button style={{...btn(true),cursor:"default"}}>🔁 {routineLabel(todo?.routine)||"カスタム"}</button>}
          </div>
          {!KNOWN_RTYPES.includes(rtype) && <div style={{...FONT_STYLE,fontSize:11,color:"#aaa",marginTop:8}}>この繰り返し設定はクイック入力で作成されたものです。保存しても設定は維持されます。</div>}
          {rtype==="weekly" && <div style={{display:"flex",gap:8,marginTop:14,flexWrap:"wrap"}}>{DAYS_JP.map((d,i)=><button key={i} onClick={()=>togDay(i)} style={{...FONT_STYLE,width:40,height:40,borderRadius:8,fontSize:14,cursor:"pointer",fontWeight:700,background:wdays.includes(i)?"#0d0d0d":"#f5f5f5",border:`1.5px solid ${wdays.includes(i)?"#0d0d0d":"#ddd"}`,color:wdays.includes(i)?"#fff":i===0?"#e03030":i===6?PINK:"#444"}}>{d}</button>)}</div>}
          {rtype==="monthly" && <div style={{display:"flex",alignItems:"center",gap:10,marginTop:14}}><span style={{fontSize:16,color:"#666"}}>毎月</span><input type="number" min="1" max="31" value={mday} onChange={e=>setMday(+e.target.value)} style={{...inp,width:64}}/><span style={{fontSize:16,color:"#666"}}>日</span></div>}
          {rtype==="date" && <div style={{display:"flex",alignItems:"center",gap:8,marginTop:14}}><input type="number" min="1" max="12" value={dm} onChange={e=>setDm(+e.target.value)} style={{...inp,width:58}}/><span style={{fontSize:16,color:"#666"}}>月</span><input type="number" min="1" max="31" value={dd} onChange={e=>setDd(+e.target.value)} style={{...inp,width:58}}/><span style={{fontSize:16,color:"#666"}}>日</span></div>}
          {rtype!=="none" && (
            <div style={{marginTop:14}}>
              <div style={{fontSize:11,fontWeight:700,color:"#aaa",marginBottom:8}}>時間帯</div>
              <div style={{display:"flex",gap:8}}>
                <button onClick={()=>setSlotHint("am")} style={{...btn(slotHint==="am"),color:slotHint==="am"?"#fff":AM_TEXT,background:slotHint==="am"?AM_ACCENT:"#f5f5f5",borderColor:slotHint==="am"?AM_ACCENT:"#ddd"}}>🌱 AM</button>
                <button onClick={()=>setSlotHint("pm")} style={{...btn(slotHint==="pm"),color:slotHint==="pm"?"#fff":PM_TEXT,background:slotHint==="pm"?PM_ACCENT:"#f5f5f5",borderColor:slotHint==="pm"?PM_ACCENT:"#ddd"}}>☀️ PM</button>
              </div>
            </div>
          )}
        </div>
        <div style={{display:"flex",gap:10,marginTop:24}}>
          <button onClick={onClose} style={{...FONT_STYLE,flex:1,padding:12,borderRadius:8,fontSize:14,fontWeight:700,background:"#f5f5f5",border:"1.5px solid #e0e0e0",color:"#666",cursor:"pointer"}}>キャンセル</button>
          <button onClick={save} style={{...FONT_STYLE,flex:2,padding:12,borderRadius:8,fontSize:14,fontWeight:700,background:"#0d0d0d",border:"none",color:"#fff",cursor:"pointer"}}>保存</button>
        </div>
      </div>
    </div>
  );
}

function TodoCard({ todo, isDone, isAm, sortIdx, colId, onEdit, onDelete, onToggle, sortDrag }) {
  const cardRef=useRef(null);
  const [showMenu,setShowMenu]=useState(false);
  const imp=!!todo.important;
  const IMP_RED="#E24B4A", IMP_RED_TEXT="#791F1F";
  const ac=isAm?AM_ACCENT:PM_ACCENT, cb=isAm?AM_LIGHT:PM_LIGHT, ct=isAm?AM_TEXT:PM_TEXT;
  const lbl=routineLabel(todo.routine);
  const borderCol = isDone?"#e8e8e8" : imp?IMP_RED : isAm?AM_BORDER:PM_BORDER;
  const borderW   = imp&&!isDone ? "3px" : "1.5px";
  return (
    <div ref={cardRef}
      data-sort-idx={sortIdx}
      draggable
      onDragStart={e=>sortDrag.onDragStart(e,colId,sortIdx)}
      onDragOver={e=>sortDrag.onDragOver(e,colId,sortIdx)}
      onDragEnd={sortDrag.onDragEnd}
      onTouchStart={e=>sortDrag.onTouchStart(e,colId,sortIdx,cardRef.current)}
      onTouchMove={sortDrag.onTouchMove}
      onTouchEnd={sortDrag.onTouchEnd}
      style={{...FONT_STYLE,position:"relative",background:isDone?"#fafafa":"#fff",border:`${borderW} solid ${borderCol}`,borderRadius:12,padding:"10px 8px 10px 4px",marginBottom:8,userSelect:"none",WebkitUserSelect:"none",WebkitTouchCallout:"none",opacity:isDone?0.58:1,touchAction:"pan-y",transition:"border-color .15s, box-shadow .15s",boxShadow:isDone?"none":"0 1px 2px rgba(0,0,0,.04)"}}>
      <div style={{display:"flex",alignItems:"flex-start",gap:8}}>
        {/* ドラッグハンドル */}
        <div style={{display:"flex",flexDirection:"column",gap:3,padding:"3px 4px",cursor:"grab",flexShrink:0,marginTop:2}}>
          {[0,1,2].map(i=><div key={i} style={{display:"flex",gap:2}}>{[0,1].map(j=><div key={j} style={{width:3,height:3,borderRadius:"50%",background:imp&&!isDone?"#F09595":"#ccc"}}/>)}</div>)}
        </div>
        {/* チェック */}
        <button aria-label={isDone?"未完了に戻す":"完了にする"} onClick={e=>{e.stopPropagation();onToggle(todo.id);}} style={{width:26,height:26,minWidth:26,borderRadius:7,marginTop:0,border:`2px solid ${isDone?ac:imp?"#F09595":"#bbb"}`,background:isDone?ac:"#fff",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,padding:0}}>
          {isDone && <span style={{color:"#fff",fontSize:14,fontWeight:700,lineHeight:1}}>✓</span>}
        </button>
        {/* テキスト */}
        <div onClick={()=>onEdit(todo)} style={{flex:1,minWidth:0,cursor:"pointer",padding:"2px 0 4px"}}>
          <div style={{...FONT_STYLE,fontSize:imp&&!isDone?14:13,fontWeight:imp&&!isDone?700:500,color:isDone?"#aaa":imp?IMP_RED_TEXT:"#111",textDecoration:isDone?"line-through":"none",lineHeight:1.5,wordBreak:"break-word"}}>{todo.text}</div>
          <div style={{display:"flex",gap:4,flexWrap:"wrap",marginTop:imp||lbl?4:0}}>
            {imp&&!isDone && <span style={{...FONT_STYLE,fontSize:10,fontWeight:700,color:IMP_RED_TEXT,background:"#F7C1C1",borderRadius:99,padding:"2px 8px"}}>‼️ 重要</span>}
            {lbl && <span style={{...FONT_STYLE,fontSize:10,fontWeight:700,color:ct,background:cb,borderRadius:4,padding:"2px 8px"}}>🔁 {lbl}</span>}
          </div>
        </div>
        <div style={{position:"relative",flexShrink:0}}>
          <button aria-label="タスクメニュー" onClick={e=>{e.stopPropagation();setShowMenu(p=>!p);}} style={{width:36,height:36,background:"transparent",border:"none",borderRadius:8,color:"#888",cursor:"pointer",fontSize:20,lineHeight:1}}>⋯</button>
          {showMenu && <div style={{position:"absolute",right:0,top:38,zIndex:20,width:138,background:"#fff",border:"1px solid #ddd",borderRadius:10,padding:5,boxShadow:"0 8px 24px rgba(0,0,0,.16)"}} onClick={e=>e.stopPropagation()}>
            <button onClick={()=>{setShowMenu(false);onEdit(todo);}} style={{...FONT_STYLE,width:"100%",padding:"10px 12px",textAlign:"left",background:"none",border:"none",borderRadius:7,fontSize:13,color:"#444",cursor:"pointer"}}>✏️ 編集</button>
            <button onClick={()=>{setShowMenu(false);onDelete(todo.id);}} style={{...FONT_STYLE,width:"100%",padding:"10px 12px",textAlign:"left",background:"#fff2f2",border:"none",borderRadius:7,fontSize:13,color:"#c33",cursor:"pointer"}}>🗑 削除</button>
          </div>}
        </div>
      </div>
    </div>
  );
}

function VolumeBar({ amCount, pmCount }) {
  const total=amCount+pmCount;
  if (!total) return <div style={{height:6,background:"#f0f0f0",borderRadius:3,margin:"8px 0 12px"}}/>;
  const ap=Math.round(amCount/total*100);
  return (
    <div style={{margin:"8px 0 12px"}}>
      <div style={{height:6,borderRadius:3,display:"flex",overflow:"hidden",gap:2}}>
        {amCount>0 && <div style={{flex:amCount,background:AM_ACCENT,borderRadius:3,transition:"flex .3s"}}/>}
        {pmCount>0 && <div style={{flex:pmCount,background:PM_ACCENT,borderRadius:3,transition:"flex .3s"}}/>}
      </div>
      <div style={{display:"flex",justifyContent:"space-between",marginTop:3}}>
        <span style={{fontSize:9,fontWeight:700,color:AM_TEXT}}>🌱 AM {amCount}件 ({ap}%)</span>
        <span style={{fontSize:9,fontWeight:700,color:PM_TEXT}}>☀️ PM {pmCount}件 ({100-ap}%)</span>
      </div>
    </div>
  );
}

function SlotColumn({ colId, isAm, todos, doneIds, onEdit, onDelete, onToggle, onAdd, sortDrag }) {
  const sorted = useMemo(()=>[...todos].sort((a,b)=>(b.important?1:0)-(a.important?1:0)), [todos]);
  return (
    <div data-colid={colId}
      style={{...FONT_STYLE,background:isAm?AM_BG:PM_BG,border:`1.5px solid ${isAm?AM_BORDER:PM_BORDER}`,borderRadius:12,padding:"12px 12px 10px",flex:1,minWidth:0}}>
      <div style={{fontSize:10,fontWeight:700,color:isAm?AM_HEAD:PM_HEAD,marginBottom:8}}>{isAm?"🌱 AM":"☀️ PM"}</div>
      {sorted.length===0 && <div style={{...FONT_STYLE,fontSize:10,color:"#ccc",textAlign:"center",padding:"14px 0",fontStyle:"italic"}}>タスクなし</div>}
      {sorted.map((todo,i)=><TodoCard key={todo.id} todo={todo} sortIdx={i} colId={colId} isDone={doneIds.has(todo.id)} isAm={isAm} onEdit={t=>onEdit(t,colId)} onDelete={onDelete} onToggle={onToggle} sortDrag={sortDrag}/>)}
      <button onClick={()=>onAdd(colId)} style={{...FONT_STYLE,marginTop:6,width:"100%",minHeight:42,padding:"8px",background:"transparent",border:`1.5px dashed ${isAm?AM_BORDER:PM_BORDER}`,borderRadius:9,color:isAm?AM_TEXT:PM_TEXT,cursor:"pointer",fontSize:11,fontWeight:700}}>＋ タスクを追加</button>
    </div>
  );
}

function DayColumn({ dayIndex, date, amTodos, pmTodos, accent, isToday, hideHeader=false, doneIds, onEdit, onDelete, onToggle, onAdd, sortDrag }) {
  const amId=`d${dayIndex}-am`, pmId=`d${dayIndex}-pm`;
  const slotProps={doneIds,onEdit,onDelete,onToggle,onAdd,sortDrag};
  return (
    <div style={{...FONT_STYLE,background:"#fff",border:hideHeader?"1px solid #e5e5e5":`${isToday?"2px":"1.5px"} solid ${isToday?PINK:"#e2e2e2"}`,borderRadius:14,padding:hideHeader?"10px":"14px 12px",boxShadow:hideHeader?"none":isToday?`0 0 0 3px ${PINK_LIGHT}`:"0 1px 4px rgba(0,0,0,.06)"}}>
      {!hideHeader && <div style={{marginBottom:4}}>
        <div style={{display:"flex",alignItems:"center",gap:6}}>
          <div style={{width:3,height:16,background:accent,borderRadius:2}}/>
          <span style={{...FONT_STYLE,fontSize:13,fontWeight:isToday?700:400,color:isToday?PINK:"#111"}}>{getDayLabel(dayIndex,date)}</span>
        </div>
        <div style={{...FONT_STYLE,fontSize:15,fontWeight:700,color:isToday?PINK:"#111",marginTop:3,marginLeft:9}}>{fmtDate(date)}（{DAYS_JP[date.getDay()]}）</div>
      </div>}
      {!hideHeader && <VolumeBar amCount={amTodos.length} pmCount={pmTodos.length}/>} 
      <div style={{display:"flex",flexDirection:"column",gap:8}}>
        <SlotColumn colId={amId} isAm={true} todos={amTodos} {...slotProps}/>
        <SlotColumn colId={pmId} isAm={false} todos={pmTodos} {...slotProps}/>
      </div>
    </div>
  );
}

function MobileDaySection({ defaultOpen=false, dayIndex, date, amTodos, pmTodos, isToday, accent, ...props }) {
  const [open,setOpen]=useState(defaultOpen);
  const total=amTodos.length+pmTodos.length;
  const done=amTodos.concat(pmTodos).filter(t=>props.doneIds.has(t.id)).length;
  return (
    <section style={{marginBottom:10}}>
      <button onClick={()=>setOpen(p=>!p)} style={{...FONT_STYLE,width:"100%",minHeight:58,display:"flex",alignItems:"center",gap:10,padding:"10px 14px",background:isToday?PINK_LIGHT:"#fff",border:`${isToday?2:1.5}px solid ${isToday?PINK:"#e2e2e2"}`,borderRadius:open?"14px 14px 8px 8px":14,boxShadow:"0 1px 4px rgba(0,0,0,.05)",cursor:"pointer",textAlign:"left"}}>
        <span style={{width:4,height:26,background:isToday?PINK:accent,borderRadius:3,flexShrink:0}}/>
        <span style={{flex:1,minWidth:0}}>
          <span style={{display:"block",fontSize:13,fontWeight:700,color:isToday?PINK:"#222"}}>{getDayLabel(dayIndex,date)} <span style={{fontWeight:500,color:"#888"}}>{fmtDate(date)}（{DAYS_JP[date.getDay()]}）</span></span>
          <span style={{display:"block",fontSize:10,color:"#999",marginTop:2}}>🌱 {amTodos.length}件　☀️ {pmTodos.length}件{done>0?`　✓ ${done}/${total}`:""}</span>
        </span>
        <span style={{fontSize:18,color:"#999",transform:open?"rotate(90deg)":"none",transition:"transform .15s"}}>›</span>
      </button>
      {open && <div style={{marginTop:6}}><DayColumn dayIndex={dayIndex} date={date} amTodos={amTodos} pmTodos={pmTodos} accent={accent} isToday={isToday} hideHeader={true} {...props}/></div>}
    </section>
  );
}

function InboxPage({ todos, doneIds, onEdit, onDelete, onToggle, onAdd, sortDrag, onQuickAdd, dateCols }) {
  const sorted = useMemo(()=>[...todos].sort((a,b)=>(b.important?1:0)-(a.important?1:0)), [todos]);
  return (
    <div style={{...FONT_STYLE,maxWidth:640,margin:"0 auto"}}>
      <div style={{marginBottom:14}}>
        <QuickEntry onAdd={onQuickAdd} dateCols={dateCols}/>
      </div>
      <div style={{...FONT_STYLE,background:"#fff",border:"1.5px solid #e2e2e2",borderRadius:14,padding:"16px 14px",boxShadow:"0 1px 4px rgba(0,0,0,.06)"}}>
        <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:12}}>
          <div style={{width:3,height:16,background:PINK,borderRadius:2}}/>
          <span style={{...FONT_STYLE,fontSize:13,fontWeight:700,color:"#111"}}>ストック</span>
          <span style={{...FONT_STYLE,fontSize:10,color:"#aaa",marginLeft:4}}>とりあえずためておく場所</span>
        </div>
        <div style={{height:1,background:"#f0f0f0",marginBottom:12}}/>
        {sorted.length===0 && <div style={{...FONT_STYLE,fontSize:12,color:"#ccc",textAlign:"center",padding:"24px 0"}}>タスクがありません</div>}
        {sorted.map((t,i)=>(
          <TodoCard key={t.id} todo={t} sortIdx={i} colId="inbox" isDone={doneIds.has(t.id)} isAm={false} onEdit={todo=>onEdit(todo,"inbox")} onDelete={onDelete} onToggle={onToggle} sortDrag={sortDrag}/>
        ))}
        <button onClick={onAdd} style={{...FONT_STYLE,marginTop:8,width:"100%",padding:"8px",background:"transparent",border:"1.5px dashed #ccc",borderRadius:8,color:"#aaa",fontSize:12,fontWeight:700,cursor:"pointer"}}>＋ 追加</button>
      </div>
    </div>
  );
}

// ── QuickEntry ヒントチップ定義 ──
const HINT_CHIPS = [
  { label:"毎日",    insert:"毎日 ",    color:PINK,      bg:PINK_LIGHT    },
  { label:"毎週月",  insert:"毎週月 ",  color:"#185FA5", bg:"#E6F1FB"    },
  { label:"毎週月水金", insert:"毎週月水金 ", color:"#185FA5", bg:"#E6F1FB" },
  { label:"明日",    insert:"明日 ",    color:"#3B6D11", bg:"#EAF3DE"    },
  { label:"今日",    insert:"今日 ",    color:"#3B6D11", bg:"#EAF3DE"    },
  { label:"2週",     insert:"2週 ",     color:"#854F0B", bg:"#FAEEDA"    },
  { label:"3日毎",   insert:"3日毎 ",   color:"#993556", bg:"#FBEAF0"    },
  { label:"毎月1日", insert:"毎月1日 ", color:"#3C3489", bg:"#EEEDFE"    },
  { label:"AM",      insert:"AM ",      color:AM_TEXT,   bg:AM_LIGHT     },
  { label:"PM",      insert:"PM ",      color:PM_TEXT,   bg:PM_LIGHT     },
];

function QuickEntry({ onAdd, dateCols }) {
  const [text,setText]=useState(""), [focused,setFocused]=useState(false);
  const isMobile = window.innerWidth < 720;
  const [expanded,setExpanded]=useState(()=>!isMobile);
  const textareaRef=useRef(null);
  const previews = useMemo(() => previewLines(text), [text]);
  const valid = useMemo(() => previews.filter(p=>p.parsed), [previews]);

  const destLabel = (parsed) => {
    if (!parsed) return null;
    const ids=resolveColIds(parsed,dateCols);
    if (!ids?.length) return { text:"📥 ストック", bg:PINK_LIGHT, color:PINK_TEXT };
    const slot=ids[0].endsWith("am");
    if (ids.length===1) { const i=+ids[0].match(/^d(\d+)/)[1]; return { text:`→ ${getDayLabel(i)} ${slot?"🌱AM":"☀️PM"}`, bg:slot?AM_LIGHT:PM_LIGHT, color:slot?AM_TEXT:PM_TEXT }; }
    return { text:`→ ${ids.length}日分 ${slot?"🌱AM":"☀️PM"}`, bg:slot?AM_LIGHT:PM_LIGHT, color:slot?AM_TEXT:PM_TEXT };
  };

  const { ic, dc } = useMemo(() => {
    const ic = valid.filter(p=>!resolveColIds(p.parsed,dateCols)?.length).length;
    return { ic, dc: valid.length - ic };
  }, [valid, dateCols]);

  const submit = () => { if (!valid.length) return; onAdd(valid.map(p=>({id:genId(),...p.parsed}))); setText(""); if(isMobile)setExpanded(false); };
  const btnLabel = ic>0&&dc>0 ? `${dc}件を直接追加・${ic}件をストックへ` : dc>0 ? `${dc}件を直接ボードに追加` : `${ic}件をストックに追加`;

  const insertChip = (insert) => {
    const ta=textareaRef.current;
    if(!ta){ setText(p=>p+insert); return; }
    const s=ta.selectionStart, e=ta.selectionEnd;
    const next=text.slice(0,s)+insert+text.slice(e);
    setText(next);
    requestAnimationFrame(()=>{ ta.focus(); ta.setSelectionRange(s+insert.length,s+insert.length); });
  };

  const chipStyle = (color,bg) => ({...FONT_STYLE,display:"inline-flex",alignItems:"center",padding:isMobile?"4px 8px":"4px 9px",borderRadius:99,fontSize:isMobile?10:11,fontWeight:700,cursor:"pointer",border:"1px solid",background:bg,color,borderColor:color+"55",whiteSpace:"nowrap",userSelect:"none"});

  if(isMobile&&!expanded) return (
    <button onClick={()=>setExpanded(true)} style={{...FONT_STYLE,width:"100%",minHeight:52,display:"flex",alignItems:"center",justifyContent:"center",gap:8,padding:"12px 16px",marginBottom:12,background:"#0d0d0d",color:"#fff",border:"none",borderRadius:13,fontSize:13,fontWeight:700,cursor:"pointer",boxShadow:"0 3px 10px rgba(0,0,0,.12)"}}>
      <span style={{fontSize:20,lineHeight:1}}>＋</span> タスクを追加
    </button>
  );

  return (
    <div style={{...FONT_STYLE,background:"#fff",border:`1.5px solid ${focused?PINK:"#d8d8d8"}`,borderRadius:12,padding:window.innerWidth<720?"10px 12px":"14px 16px",marginBottom:12,boxShadow:focused?`0 0 0 3px ${PINK_LIGHT}`:"0 1px 3px rgba(0,0,0,.06)",boxSizing:"border-box",width:"100%",overflow:"hidden"}}>
      <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:8}}>
        <span style={{fontSize:11,fontWeight:700,color:PINK}}>＋ タスクを追加</span>
        {!isMobile && <span style={{fontSize:10,color:"#bbb",marginLeft:"auto"}}>⌘Enter</span>}
        {isMobile && <button onClick={()=>{setExpanded(false);setText("");}} aria-label="入力を閉じる" style={{marginLeft:"auto",width:32,height:32,border:"none",borderRadius:8,background:"#f3f3f3",color:"#888",fontSize:18,cursor:"pointer"}}>×</button>}
      </div>

      {/* テキストエリア */}
      <textarea ref={textareaRef} value={text} onChange={e=>setText(e.target.value)} onFocus={()=>setFocused(true)} onBlur={()=>setFocused(false)}
        onKeyDown={e=>{if(e.key==="Enter"&&(e.metaKey||e.ctrlKey)){e.preventDefault();submit();}}}
        rows={2} placeholder="タスク名 + 日時語句…"
        style={{...FONT_STYLE,width:"100%",background:"#f7f7f7",border:"1.5px solid #e8e8e8",borderRadius:6,padding:"9px 11px",fontSize:12,color:"#333",lineHeight:1.6,resize:"none",outline:"none",boxSizing:"border-box"}}/>

      {/* ① ヒントチップ：横スクロール1行 */}
      <div style={{display:"flex",flexWrap:isMobile?"nowrap":"wrap",overflowX:isMobile?"auto":"visible",WebkitOverflowScrolling:"touch",gap:6,marginTop:8,paddingBottom:isMobile?3:0}}>
        {HINT_CHIPS.map(ch=>(
          <span key={ch.label} onClick={()=>insertChip(ch.insert)} style={{...chipStyle(ch.color,ch.bg)}}>{ch.label}</span>
        ))}
      </div>

      {/* ② リアルタイムプレビュー */}
      {text.trim() && (
        <div style={{marginTop:8,background:"#f8f8f8",borderRadius:8,padding:"8px 10px"}}>
          {previews.map((item,i) => {
            if (!item.original.trim()) return null;
            const p=item.parsed, dest=p?destLabel(p):null;
            const lbl=routineLabel(p?.routine);
            return (
              <div key={`pv-${i}`} style={{display:"flex",alignItems:"center",gap:6,fontSize:12,marginBottom:i<previews.filter(x=>x.original.trim()).length-1?5:0,opacity:p?1:.4}}>
                <span style={{color:p?"#1b7a3a":"#cc3333",fontSize:11,fontWeight:700,flexShrink:0}}>{p?"✓":"✗"}</span>
                <span style={{color:"#222",flex:1,minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p?p.text:item.original}</span>
                {lbl && <span style={{...FONT_STYLE,fontSize:10,fontWeight:700,color:PINK_TEXT,background:PINK_LIGHT,borderRadius:99,padding:"2px 7px",whiteSpace:"nowrap",flexShrink:0}}>🔁 {lbl}</span>}
                {dest && <span style={{...FONT_STYLE,fontSize:10,fontWeight:700,color:dest.color,background:dest.bg,borderRadius:99,padding:"2px 7px",whiteSpace:"nowrap",flexShrink:0}}>{dest.text}</span>}
              </div>
            );
          })}
          {valid.length>0 && <button onClick={submit} style={{...FONT_STYLE,marginTop:8,width:"100%",padding:"8px",background:"#0d0d0d",color:"#fff",fontSize:12,fontWeight:700,borderRadius:6,border:"none",cursor:"pointer"}}>{btnLabel}</button>}
        </div>
      )}
    </div>
  );
}

// ルーティン同一性比較（JSON.stringifyのキー順序問題を回避）
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
  const [editDef,setEditDef]=useState(null), [text,setText]=useState(""), [rtype,setRtype]=useState("weekly");
  const [wdays,setWdays]=useState([]), [slot,setSlot]=useState("am"), [expiresAt,setExpiresAt]=useState(""), [mday,setMday]=useState(1);
  const openNew = () => { setEditDef({}); setText(""); setRtype("weekly"); setWdays([]); setSlot("am"); setExpiresAt(""); setMday(1); };
  const openEdit = def => { setEditDef(def); setText(def.text); setRtype(def.routine?.type||"weekly"); setWdays(def.routine?.days||[]); setSlot(def.slotHint||"am"); setExpiresAt(def.expiresAt||""); setMday(def.routine?.day||1); };
  const togDay = d => setWdays(p=>p.includes(d)?p.filter(x=>x!==d):[...p,d].sort());
  const RM_KNOWN_RTYPES=["daily","weekly","monthly"];
  const save = () => {
    if (!text.trim()) return;
    const routine =
      rtype==="daily" ? {type:"daily"} :
      rtype==="weekly" ? {type:"weekly",days:wdays} :
      rtype==="monthly" ? {type:"monthly",day:mday} :
      (editDef?.routine ?? {type:"weekly",days:wdays}); // nweekly/ndaily等この画面で編集できないタイプは温存
    const def = { ...(editDef?.id?editDef:{}), id:editDef?.id||genId(), text:text.trim(), routine, slotHint:slot, active:editDef?.active!==false, expiresAt:expiresAt||null };
    editDef?.id ? onUpdate(def) : onAdd(def);
    setEditDef(null);
  };
  const inp={...FONT_STYLE,background:"#f7f7f7",border:"1.5px solid #e0e0e0",borderRadius:6,color:"#111",padding:"7px 10px",fontSize:13,outline:"none"};
  const routineStr = def => routineLabel(def.routine) || ""; // nweekly/ndaily/dateも含め全タイプ対応
  const sortKey = def => { const r=def.routine; if(!r)return 999; if(r.type==="daily")return -1; if(r.type==="weekly")return Math.min(...r.days); if(r.type==="monthly")return 100+(r.day||0); return 999; };
  const sorted=[...routines].sort((a,b)=>sortKey(a)-sortKey(b));
  const btn=(active)=>({...FONT_STYLE,padding:"7px 16px",borderRadius:6,fontSize:13,cursor:"pointer",fontWeight:700,background:active?"#0d0d0d":"#f5f5f5",border:`1.5px solid ${active?"#0d0d0d":"#ddd"}`,color:active?"#fff":"#555"});
  return (
    <div style={{...FONT_STYLE,maxWidth:640,margin:"0 auto"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
        <div style={{...FONT_STYLE,fontSize:14,fontWeight:700,color:"#111"}}>ルーティン定義 ({routines.length}件)</div>
        <button onClick={openNew} style={{...FONT_STYLE,padding:"8px 16px",background:"#0d0d0d",color:"#fff",border:"none",borderRadius:8,fontSize:13,fontWeight:700,cursor:"pointer"}}>＋ 新規追加</button>
      </div>
      {routines.length===0 && <div style={{background:"#fff",border:"1.5px solid #e2e2e2",borderRadius:14,padding:"32px",textAlign:"center"}}>
        <div style={{fontSize:28,marginBottom:8}}>🔁</div>
        <div style={{...FONT_STYLE,fontSize:13,color:"#aaa"}}>ルーティンがありません</div>
        <div style={{...FONT_STYLE,fontSize:11,color:"#ccc",marginTop:4}}>「＋ 新規追加」から作成してください</div>
      </div>}
      {sorted.map(def => {
        const today=new Date(); today.setHours(0,0,0,0);
        const expired=def.expiresAt&&new Date(def.expiresAt)<today;
        return (
          <div key={def.id} style={{background:"#fff",border:`1.5px solid ${expired?"#f0d0d0":def.active?"#e2e2e2":"#eee"}`,borderRadius:12,padding:"14px 16px",marginBottom:10,opacity:def.active&&!expired?1:0.6}}>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <div onClick={()=>!expired&&onToggle(def.id)} style={{width:36,height:20,borderRadius:10,background:def.active&&!expired?"#0d0d0d":"#ddd",cursor:expired?"default":"pointer",position:"relative",flexShrink:0,transition:"background .2s"}}>
                <div style={{position:"absolute",top:2,left:def.active&&!expired?18:2,width:16,height:16,borderRadius:"50%",background:"#fff",transition:"left .2s"}}/>
              </div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{...FONT_STYLE,fontSize:14,fontWeight:700,color:"#111",marginBottom:3}}>{def.text}</div>
                <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
                  <span style={{fontSize:11,fontWeight:700,color:PINK_TEXT,background:PINK_LIGHT,borderRadius:4,padding:"2px 8px"}}>🔁 {routineStr(def)}</span>
                  <span style={{fontSize:11,fontWeight:700,color:def.slotHint==="am"?AM_TEXT:PM_TEXT,background:def.slotHint==="am"?AM_LIGHT:PM_LIGHT,borderRadius:4,padding:"2px 8px"}}>{def.slotHint==="am"?"🌱 AM":"☀️ PM"}</span>
                  {def.expiresAt && <span style={{fontSize:11,fontWeight:700,color:expired?"#cc3333":"#888",background:expired?"#ffeaea":"#f5f5f5",borderRadius:4,padding:"2px 8px"}}>{expired?"⚠️ 期限切れ":"📅"} {def.expiresAt}まで</span>}
                  {!def.expiresAt && <span style={{fontSize:11,color:"#aaa"}}>無期限</span>}
                </div>
              </div>
              <div style={{display:"flex",gap:4,flexShrink:0}}>
                <button onClick={()=>openEdit(def)} style={{background:"#f5f5f5",border:"1.5px solid #e0e0e0",borderRadius:6,padding:"5px 10px",fontSize:12,cursor:"pointer",color:"#555"}}>✏️ 編集</button>
                <button onClick={()=>onDelete(def.id)} style={{background:"#fff0f0",border:"1.5px solid #f0d0d0",borderRadius:6,padding:"5px 10px",fontSize:12,cursor:"pointer",color:"#cc3333"}}>🗑</button>
              </div>
            </div>
          </div>
        );
      })}
      {editDef!==null && (
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.45)",display:"flex",alignItems:"flex-end",justifyContent:"center",zIndex:2000}} onClick={()=>setEditDef(null)}>
          <div style={{...FONT_STYLE,background:"#fff",borderRadius:"20px 20px 0 0",padding:"24px 20px",paddingBottom:"calc(28px + env(safe-area-inset-bottom))",width:"100%",maxWidth:520,boxShadow:"0 -4px 24px rgba(0,0,0,.12)",maxHeight:"92dvh",overflowY:"auto"}} onClick={e=>e.stopPropagation()}>
            <div style={{width:40,height:4,background:"#ddd",borderRadius:2,margin:"0 auto 20px"}}/>
            <div style={{fontSize:13,fontWeight:700,color:PINK,marginBottom:14}}>{editDef?.id?"ルーティンを編集":"新しいルーティン"}</div>
            <div style={{fontSize:11,fontWeight:700,color:"#aaa",marginBottom:6}}>タスク名</div>
            <input value={text} onChange={e=>setText(e.target.value)} placeholder="タスクの内容..." style={{...inp,width:"100%",boxSizing:"border-box",marginBottom:16,fontSize:16,padding:"10px 12px"}}/>
            <div style={{fontSize:11,fontWeight:700,color:"#aaa",marginBottom:8}}>繰り返し</div>
            <div style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap"}}>
              {[["daily","毎日"],["weekly","毎週"],["monthly","毎月"]].map(([v,l])=><button key={v} onClick={()=>setRtype(v)} style={btn(rtype===v)}>{l}</button>)}
              {!RM_KNOWN_RTYPES.includes(rtype) && <button style={{...btn(true),cursor:"default"}}>🔁 {routineLabel(editDef?.routine)||"カスタム"}</button>}
            </div>
            {!RM_KNOWN_RTYPES.includes(rtype) && <div style={{...FONT_STYLE,fontSize:11,color:"#aaa",marginBottom:12}}>この繰り返し設定はクイック入力で作成されたものです。保存しても設定は維持されます。</div>}
            {rtype==="weekly" && <div style={{display:"flex",gap:8,marginBottom:16,flexWrap:"wrap"}}>{DAYS_JP.map((d,i)=><button key={i} onClick={()=>togDay(i)} style={{...FONT_STYLE,width:40,height:40,borderRadius:8,fontSize:14,cursor:"pointer",fontWeight:700,background:wdays.includes(i)?"#0d0d0d":"#f5f5f5",border:`1.5px solid ${wdays.includes(i)?"#0d0d0d":"#ddd"}`,color:wdays.includes(i)?"#fff":i===0?"#e03030":i===6?PINK:"#444"}}>{d}</button>)}</div>}
            {rtype==="monthly" && <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16}}><span style={{fontSize:16,color:"#666"}}>毎月</span><input type="number" min="1" max="31" value={mday} onChange={e=>setMday(+e.target.value)} style={{...inp,width:64}}/><span style={{fontSize:16,color:"#666"}}>日</span></div>}
            <div style={{fontSize:11,fontWeight:700,color:"#aaa",marginBottom:8}}>時間帯</div>
            <div style={{display:"flex",gap:8,marginBottom:16}}>{[["am","🌱 AM"],["pm","☀️ PM"]].map(([v,l])=><button key={v} onClick={()=>setSlot(v)} style={btn(slot===v)}>{l}</button>)}</div>
            <div style={{fontSize:11,fontWeight:700,color:"#aaa",marginBottom:8}}>有効期限（なし＝無期限）</div>
            <input type="date" value={expiresAt} onChange={e=>setExpiresAt(e.target.value)} style={{...inp,width:"100%",boxSizing:"border-box",marginBottom:expiresAt?4:20}}/>
            {expiresAt && <button onClick={()=>setExpiresAt("")} style={{...FONT_STYLE,fontSize:11,color:"#aaa",background:"none",border:"none",cursor:"pointer",marginBottom:16,display:"block"}}>✕ 期限をクリア</button>}
            <div style={{display:"flex",gap:10}}>
              <button onClick={()=>setEditDef(null)} style={{...FONT_STYLE,flex:1,padding:12,borderRadius:8,fontSize:14,fontWeight:700,background:"#f5f5f5",border:"1.5px solid #e0e0e0",color:"#666",cursor:"pointer"}}>キャンセル</button>
              <button onClick={save} style={{...FONT_STYLE,flex:2,padding:12,borderRadius:8,fontSize:14,fontWeight:700,background:"#0d0d0d",border:"none",color:"#fff",cursor:"pointer"}}>保存して反映</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


// ── Quick Guide ───────────────────────────────────────────────────────────────
function GuideCard({ emoji, title, color, bg, border, children }) {
  return (
    <div style={{ background:bg, border:`1.5px solid ${border}`, borderRadius:14, padding:"18px 16px", marginBottom:16 }}>
      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:12 }}>
        <span style={{ fontSize:22 }}>{emoji}</span>
        <span style={{ ...FONT_STYLE, fontSize:15, fontWeight:700, color }}>{title}</span>
      </div>
      {children}
    </div>
  );
}
function GuideStep({ num, text, sub }) {
  return (
    <div style={{ display:"flex", gap:10, marginBottom:10, alignItems:"flex-start" }}>
      <div style={{ width:22, height:22, borderRadius:"50%", background:"#0d0d0d", color:"#fff", fontSize:11, fontWeight:700, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, marginTop:1 }}>{num}</div>
      <div>
        <div style={{ ...FONT_STYLE, fontSize:13, color:"#111", fontWeight:500 }}>{text}</div>
        {sub && <div style={{ ...FONT_STYLE, fontSize:11, color:"#888", marginTop:2 }}>{sub}</div>}
      </div>
    </div>
  );
}
function GuideMockCard({ text, routine, isAm, isDone }) {
  const ac=isAm?AM_ACCENT:PM_ACCENT, ct=isAm?AM_TEXT:PM_TEXT, cb=isAm?AM_LIGHT:PM_LIGHT;
  const border=isAm?AM_BORDER:PM_BORDER;
  return (
    <div style={{ background:isDone?"#fafafa":"#fff", border:`1.5px solid ${isDone?"#eee":border}`, borderRadius:10, padding:"9px 10px", marginBottom:6, opacity:isDone?0.6:1 }}>
      <div style={{ display:"flex", alignItems:"center", gap:8 }}>
        <div style={{ width:16, height:16, borderRadius:3, border:`2px solid ${isDone?ac:"#ccc"}`, background:isDone?ac:"transparent", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
          {isDone && <span style={{ color:"#fff", fontSize:10, fontWeight:700 }}>✓</span>}
        </div>
        <div style={{ flex:1 }}>
          <div style={{ ...FONT_STYLE, fontSize:12, fontWeight:500, color:isDone?"#aaa":"#111", textDecoration:isDone?"line-through":"none" }}>{text}</div>
          {routine && <span style={{ ...FONT_STYLE, fontSize:10, fontWeight:700, color:ct, background:cb, borderRadius:4, padding:"1px 6px", display:"inline-block", marginTop:3 }}>🔁 {routine}</span>}
        </div>
        <span style={{ color:"#ccc", fontSize:12 }}>✏️🗑</span>
      </div>
    </div>
  );
}
function GuideMockSlot({ isAm, todos=[] }) {
  const bg=isAm?AM_BG:PM_BG, border=isAm?AM_BORDER:PM_BORDER, head=isAm?AM_HEAD:PM_HEAD;
  return (
    <div style={{ background:bg, border:`1.5px solid ${border}`, borderRadius:10, padding:"10px", flex:1, minWidth:0 }}>
      <div style={{ fontSize:11, fontWeight:700, color:head, marginBottom:6 }}>{isAm?"🌱 AM":"☀️ PM"}</div>
      {todos.map((t,i)=><GuideMockCard key={i} {...t} isAm={isAm}/>)}
      {todos.length===0 && <div style={{ ...FONT_STYLE, fontSize:11, color:"#ccc", textAlign:"center", padding:"8px 0", fontStyle:"italic" }}>ドロップ</div>}
    </div>
  );
}

function QuickGuide() {
  return (
    <div style={{ ...FONT_STYLE, maxWidth:640, margin:"0 auto" }}>

      {/* ウェルカム */}
      <div style={{ background:"linear-gradient(135deg,#fce8f1,#fff6ee)", border:"1.5px solid #f5a55a", borderRadius:14, padding:"20px 18px", marginBottom:16, textAlign:"center" }}>
        <div style={{ fontSize:32, marginBottom:8 }}>👋</div>
        <div style={{ fontSize:16, fontWeight:700, color:"#0d0d0d", marginBottom:4 }}>Task Board へようこそ！</div>
        <div style={{ fontSize:12, color:"#888", lineHeight:1.6 }}>タスクをAM・PMに分けて管理できる<br/>シンプルなタスクボードです</div>
      </div>

      {/* ボードの見方 */}
      <GuideCard emoji="🗂" title="ボードの見方" color="#2563b0" bg="#f0f5ff" border="#b0c8f0">
        <div style={{ background:"#fff", border:"1.5px solid #ddd", borderRadius:10, padding:12, marginBottom:12 }}>
          <div style={{ ...FONT_STYLE, fontSize:10, color:"#aaa", marginBottom:4 }}>今日 <strong style={{ color:"#111", fontSize:12 }}>5/21（水）</strong></div>
          <div style={{ height:5, background:"#f0f0f0", borderRadius:3, marginBottom:4, display:"flex", overflow:"hidden", gap:2 }}>
            <div style={{ flex:2, background:AM_ACCENT, borderRadius:3 }}/>
            <div style={{ flex:1, background:PM_ACCENT, borderRadius:3 }}/>
          </div>
          <div style={{ fontSize:9, display:"flex", justifyContent:"space-between", marginBottom:10, color:"#666" }}>
            <span style={{ color:AM_TEXT }}>🌱 AM 2件 (67%)</span>
            <span style={{ color:PM_TEXT }}>☀️ PM 1件 (33%)</span>
          </div>
          <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
            <GuideMockSlot isAm={true} todos={[{text:"朝のストレッチ",routine:"毎日"},{text:"企画書を作成する"}]}/>
            <GuideMockSlot isAm={false} todos={[{text:"夕食の準備"}]}/>
          </div>
        </div>
        <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:8 }}>
          <div style={{ display:"flex", alignItems:"center", gap:5, fontSize:12, color:"#555" }}>
            <span style={{ fontSize:10, fontWeight:700, color:AM_TEXT, background:AM_LIGHT, borderRadius:4, padding:"2px 8px" }}>🌱 AM</span>
            <span>午前中のタスク</span>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:5, fontSize:12, color:"#555" }}>
            <span style={{ fontSize:10, fontWeight:700, color:PM_TEXT, background:PM_LIGHT, borderRadius:4, padding:"2px 8px" }}>☀️ PM</span>
            <span>午後のタスク</span>
          </div>
        </div>
        <div style={{ padding:"8px 10px", background:"#fff", border:"1.5px solid #ddd", borderRadius:8, fontSize:11, color:"#555" }}>
          上部の <strong>カラーバー</strong> でAM/PMの量が一目でわかります
        </div>
      </GuideCard>

      {/* タスクの追加 */}
      <GuideCard emoji="➕" title="タスクを追加する" color="#2a6e2a" bg="#f2faf2" border="#8ed08e">
        <div style={{ ...FONT_STYLE, fontSize:12, fontWeight:700, color:"#2a6e2a", marginBottom:12 }}>2通りの方法があります</div>
        <div style={{ marginBottom:14 }}>
          <div style={{ ...FONT_STYLE, fontSize:11, fontWeight:700, color:"#2a6e2a", marginBottom:6 }}>① ⚡ クイック入力（おすすめ）</div>
          <div style={{ background:"#fff", borderRadius:10, padding:"12px", border:"1.5px solid #ddd", fontSize:11, color:"#999", lineHeight:2 }}>
          <div style={{ background:"#fff", border:"1.5px solid #ddd", borderRadius:8, padding:"8px 10px", marginBottom:8, fontSize:11, color:"#555", lineHeight:1.6 }}>
            入力形式：<strong>タスク名 ＋ 日時指定語句 ＋ AM or PM</strong><br/>
            <span style={{ color:"#888" }}>例）歯医者　6/15　PM　→ 6月15日のPMに追加</span>
          </div>
            買い物　<span style={{ background:"#fce8f1", color:PINK_TEXT, borderRadius:4, padding:"1px 6px", fontSize:11, fontWeight:700 }}>→ ストック</span><br/>
            ゴミ出し 毎週火金　<span style={{ background:AM_LIGHT, color:AM_TEXT, borderRadius:4, padding:"1px 6px", fontSize:11, fontWeight:700 }}>→ 火・金 🌱AM</span><br/>
            歯医者 6/15 PM　<span style={{ background:PM_LIGHT, color:PM_TEXT, borderRadius:4, padding:"1px 6px", fontSize:11, fontWeight:700 }}>→ 6/15 ☀️PM</span><br/>
            朝の体操 毎日　<span style={{ background:AM_LIGHT, color:AM_TEXT, borderRadius:4, padding:"1px 6px", fontSize:11, fontWeight:700 }}>→ 今日〜6日後 🌱AM</span>
          </div>
          <div style={{ fontSize:11, color:"#888", marginTop:6 }}>入力後に <strong>Ctrl+Enter</strong>（PC）または <strong>追加ボタン</strong> を押す</div>
        </div>
        <div style={{ borderTop:"1px solid #d4ead4", paddingTop:12 }}>
          <div style={{ ...FONT_STYLE, fontSize:12, fontWeight:700, color:"#2a6e2a", marginBottom:8 }}>② ＋ボタンから追加</div>
          <GuideStep num="1" text="各列の「＋ 追加」ボタンをタップ"/>
          <GuideStep num="2" text="タスク名を入力"/>
          <GuideStep num="3" text="ルーティン設定（任意）" sub="毎日・毎週・毎月・日付指定から選べます"/>
          <GuideStep num="4" text="「保存」を押して完了"/>
        </div>
      </GuideCard>

      {/* タスクの操作 */}
      <GuideCard emoji="✅" title="タスクを操作する" color="#7030b0" bg="#f8f2ff" border="#c8a0e0">
        <div style={{ marginBottom:12 }}>
          <GuideMockCard text="企画書を作成する" isAm={true}/>
          <GuideMockCard text="メールを確認する" routine="毎週月・水・金" isAm={true}/>
          <GuideMockCard text="完了したタスク" isAm={false} isDone={true}/>
        </div>
        <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
          {[
            ["☑️","チェックボックスをタップ","完了/未完了を切り替え"],
            ["✏️","鉛筆アイコンをタップ","タスクを編集"],
            ["🗑","ゴミ箱アイコンをタップ","ゴミ箱へ移動（3日間保存）"],
            ["👆","長押し＆ドラッグ","別の列・日付に移動（スマホ対応）"],
          ].map(([icon,label,desc],i)=>(
            <div key={i} style={{ display:"flex", gap:10, alignItems:"center", padding:"8px 10px", background:"#fff", borderRadius:8, fontSize:12, color:"#333" }}>
              <span style={{ fontSize:16, width:24, textAlign:"center" }}>{icon}</span>
              <div>
                <strong>{label}</strong>
                <span style={{ color:"#888" }}> → {desc}</span>
              </div>
            </div>
          ))}
        </div>
      </GuideCard>

      {/* ストック */}
      <GuideCard emoji="📥" title="ストックとは" color={PINK_TEXT} bg={PINK_LIGHT} border="#f0b0cc">
        <div style={{ fontSize:12, color:"#555", lineHeight:1.7, marginBottom:12 }}>
          日程未定のタスクや、とりあえずメモしたいことを置く場所。<br/>
          ストックから各日付のAM/PMへドラッグして移動できます。
        </div>
        <div style={{ background:"#fff", border:"1.5px solid #ddd", borderRadius:10, padding:12, marginBottom:8 }}>
          <div style={{ fontSize:10, fontWeight:700, color:PINK_TEXT, marginBottom:8 }}>📥 ストック</div>
          <GuideMockCard text="企画書のフォーマット修正" isAm={false}/>
          <GuideMockCard text="メールを確認する" routine="毎週月・水・金" isAm={false}/>
          <GuideMockCard text="歯医者の予約をとる" isAm={false}/>
          <GuideMockCard text="買い物リストを更新する" isAm={false}/>
          <GuideMockCard text="週次レポートを提出" routine="毎週金" isAm={false}/>
          <GuideMockCard text="クリーニングを取りに行く" isAm={false}/>
          <div style={{ marginTop:6, border:"1.5px dashed #ddd", borderRadius:6, padding:6, textAlign:"center", fontSize:11, color:"#ccc" }}>＋ 追加</div>
        </div>
        <div style={{ fontSize:11, color:"#888" }}>長押し＆ドラッグで日付列のAM/PMに移動できます</div>
      </GuideCard>

      {/* ルーティン管理 */}
      <GuideCard emoji="🔁" title="ルーティン管理" color="#b07020" bg="#fff8ee" border="#f0c878">
        <div style={{ fontSize:12, color:"#555", lineHeight:1.7, marginBottom:12 }}>
          毎日・毎週など繰り返すタスクを登録しておくと、<br/>
          アプリを開くたびに自動で今週の列に追加されます。
        </div>
        <div style={{ background:"#fff", borderRadius:10, padding:"12px", border:"1.5px solid #e8d8b0", marginBottom:10 }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
            <div>
              <div style={{ fontSize:13, fontWeight:700, color:"#111" }}>朝のストレッチ</div>
              <div style={{ display:"flex", gap:6, marginTop:4, flexWrap:"wrap" }}>
                <span style={{ fontSize:10, fontWeight:700, color:PINK_TEXT, background:PINK_LIGHT, borderRadius:4, padding:"2px 8px" }}>🔁 毎日</span>
                <span style={{ fontSize:10, fontWeight:700, color:AM_TEXT, background:AM_LIGHT, borderRadius:4, padding:"2px 8px" }}>🌱 AM</span>
                <span style={{ fontSize:11, color:"#aaa" }}>無期限</span>
              </div>
            </div>
            <div style={{ width:36, height:20, borderRadius:10, background:"#0d0d0d", position:"relative", flexShrink:0 }}>
              <div style={{ position:"absolute", top:2, left:18, width:16, height:16, borderRadius:"50%", background:"#fff" }}/>
            </div>
          </div>
        </div>
        <div style={{ fontSize:11, color:"#888", lineHeight:1.8 }}>
          📅 <strong>有効期限</strong>を設定すると期限後は自動生成されません<br/>
          🔘 <strong>トグルスイッチ</strong>でON/OFFを切り替えられます
        </div>
      </GuideCard>


      {/* ゴミ箱 */}
      <GuideCard emoji="🗑" title="ゴミ箱" color="#666" bg="#f5f5f5" border="#ddd">
        <div style={{ fontSize:12, color:"#555", lineHeight:1.7, marginBottom:12 }}>
          削除したタスクは即座に消えず、<strong>3日間ゴミ箱に保存</strong>されます。
        </div>
        <div style={{ background:"#fff", borderRadius:10, padding:"12px", border:"1.5px solid #e0e0e0", marginBottom:10 }}>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:12, fontWeight:500, color:"#aaa", textDecoration:"line-through" }}>買い物リスト更新</div>
              <div style={{ fontSize:10, color:"#ccc", marginTop:2 }}>2日後に消去</div>
            </div>
            <div style={{ display:"flex", gap:6 }}>
              <span style={{ fontSize:11, fontWeight:700, color:"#2a6e2a", background:"#e4f5e4", borderRadius:6, padding:"4px 10px" }}>↩ 復元</span>
              <span style={{ fontSize:11, color:"#cc3333", background:"#fff0f0", borderRadius:6, padding:"4px 8px" }}>✕</span>
            </div>
          </div>
        </div>
        <div style={{ fontSize:11, color:"#888" }}>3日経過すると自動で完全削除されます</div>
      </GuideCard>

      {/* クイック入力参考例 */}
      <GuideCard emoji="📝" title="クイック入力参考例" color="#2563b0" bg="#f0f5ff" border="#b0c8f0">
        <div style={{ display:"flex", flexDirection:"column", gap:3 }}>
          {[
            ["買い物","📥 ストック"],
            ["買い物　明日","→ 明日 🌱AM"],
            ["買い物　明日　PM","→ 明日 ☀️PM"],
            ["ゴミ出し　毎週火金","→ 火・金 🌱AM（毎週）"],
            ["朝の体操　毎日","→ 今日〜6日後 🌱AM"],
            ["夜のストレッチ　毎日　PM","→ 今日〜6日後 ☀️PM"],
            ["歯医者　6/15","→ 6/15 🌱AM"],
            ["歯医者　6/15　PM","→ 6/15 ☀️PM"],
            ["請求書　毎月25日","→ 今月25日 🌱AM"],
          ].map(([input,output],i)=>(
            <div key={i} style={{ display:"flex", alignItems:"baseline", padding:"5px 8px", background:i%2===0?"#fff":"#f4f7ff", borderRadius:6 }}>
              <span style={{ ...FONT_STYLE, flex:"0 0 180px", fontSize:11, color:"#333" }}>{input}</span>
              <span style={{ ...FONT_STYLE, fontSize:11, color:"#888", whiteSpace:"nowrap" }}>{output}</span>
            </div>
          ))}
        </div>
      </GuideCard>

    </div>
  );
}

function TrashBin({ trash, onRestore, onPermanentDelete, onClearAll }) {
  const now=Date.now();
  const sorted=[...trash].sort((a,b)=>b.deletedAt-a.deletedAt);
  const timeLeft = ms => { const h=Math.floor((THREE_DAYS-(now-ms))/3600000),d=Math.floor(h/24); return d>0?`${d}日後に消去`:h>0?`${h}時間後に消去`:"まもなく消去"; };
  return (
    <div style={{...FONT_STYLE,maxWidth:640,margin:"0 auto"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
        <div style={{...FONT_STYLE,fontSize:14,fontWeight:700,color:"#111"}}>ゴミ箱 ({trash.length}件)</div>
        {trash.length>0 && <button onClick={onClearAll} style={{...FONT_STYLE,padding:"7px 14px",background:"#fff0f0",border:"1.5px solid #f0d0d0",borderRadius:8,fontSize:12,fontWeight:700,color:"#cc3333",cursor:"pointer"}}>🗑 すべて完全削除</button>}
      </div>
      <div style={{...FONT_STYLE,fontSize:11,color:"#aaa",marginBottom:12}}>削除後3日で自動消去されます</div>
      {trash.length===0 && <div style={{background:"#fff",border:"1.5px solid #e2e2e2",borderRadius:14,padding:"32px",textAlign:"center"}}><div style={{fontSize:28,marginBottom:8}}>🗑</div><div style={{...FONT_STYLE,fontSize:13,color:"#aaa"}}>ゴミ箱は空です</div></div>}
      {sorted.map(item=>(
        <div key={item.id} style={{background:"#fff",border:"1.5px solid #ebebeb",borderRadius:12,padding:"12px 14px",marginBottom:8,display:"flex",alignItems:"center",gap:10}}>
          <div style={{flex:1,minWidth:0}}>
            <div style={{...FONT_STYLE,fontSize:13,fontWeight:500,color:"#aaa",textDecoration:"line-through",wordBreak:"break-word"}}>{item.text}</div>
            <div style={{...FONT_STYLE,fontSize:10,color:"#ccc",marginTop:3}}>{timeLeft(item.deletedAt)}</div>
          </div>
          <div style={{display:"flex",gap:6,flexShrink:0}}>
            <button onClick={()=>onRestore(item)} style={{...FONT_STYLE,padding:"6px 12px",background:"#f2faf2",border:"1.5px solid #8ed08e",borderRadius:7,fontSize:12,fontWeight:700,color:"#2a6e2a",cursor:"pointer"}}>↩ 復元</button>
            <button onClick={()=>onPermanentDelete(item.id)} style={{...FONT_STYLE,padding:"6px 10px",background:"#fff0f0",border:"1.5px solid #f0d0d0",borderRadius:7,fontSize:12,color:"#cc3333",cursor:"pointer"}}>✕</button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── App ───────────────────────────────────────────────────────────────────────
function ReadonlySlot({isAm, todos, doneIds}) {
  const ac = isAm ? AM_ACCENT : PM_ACCENT;
  return (
    <div style={{...FONT_STYLE,background:isAm?"#f8faf8":"#fffaf6",border:`1.5px solid ${isAm?"#c8e0c8":"#e8d0b8"}`,borderRadius:12,padding:"10px 12px",flex:1}}>
      <div style={{fontSize:11,fontWeight:700,color:isAm?AM_HEAD:PM_HEAD,marginBottom:6}}>{isAm?"🌱 AM":"☀️ PM"}</div>
      {todos.length===0 && <div style={{fontSize:11,color:"#ddd",textAlign:"center",padding:"10px 0",fontStyle:"italic"}}>なし</div>}
      {todos.map(t=>(
        <div key={t.id} style={{...FONT_STYLE,background:"#fff",border:`${t.important?"2px solid #E24B4A":"1.5px solid #eee"}`,borderRadius:8,padding:"8px 10px",marginBottom:6,opacity:doneIds.has(t.id)?0.5:1}}>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <div style={{width:14,height:14,borderRadius:3,border:`2px solid ${doneIds.has(t.id)?ac:"#ddd"}`,background:doneIds.has(t.id)?ac:"transparent",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center"}}>
              {doneIds.has(t.id) && <span style={{color:"#fff",fontSize:9,fontWeight:700}}>✓</span>}
            </div>
            <span style={{...FONT_STYLE,fontSize:t.important?13:12,fontWeight:t.important?700:400,color:doneIds.has(t.id)?"#bbb":t.important?"#791F1F":"#555",textDecoration:doneIds.has(t.id)?"line-through":"none",flex:1,wordBreak:"break-word"}}>{t.text}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function App() {
  const dateCols     = useMemo(() => getWeekDateCols(0),  []);
  const nextWeek1Cols= useMemo(() => getWeekDateCols(1),  []);
  const nextWeek2Cols= useMemo(() => getWeekDateCols(2),  []);
  const prevWeek1Cols= useMemo(() => getWeekDateCols(-1), []);
  const prevWeek2Cols= useMemo(() => getWeekDateCols(-2), []);
  const [boardWeek,setBoardWeek]=useState(0);
  const [loaded,setLoaded]=useState(false);
  const [authed,setAuthed]=useState(false);
  const [isNewUser,setIsNewUser]=useState(false);
  const [savedHash,setSavedHash]=useState(null);
  const [authError,setAuthError]=useState("");
  const [tab,setTab]=useState("board");
  const [inbox,setInbox]=useState([]);
  const [amCols,setAmCols]=useState(()=>dateCols.map(()=>[]));
  const [pmCols,setPmCols]=useState(()=>dateCols.map(()=>[]));
  const [amNext1,setAmNext1]=useState(()=>nextWeek1Cols.map(()=>[]));
  const [pmNext1,setPmNext1]=useState(()=>nextWeek1Cols.map(()=>[]));
  const [amNext2,setAmNext2]=useState(()=>nextWeek2Cols.map(()=>[]));
  const [pmNext2,setPmNext2]=useState(()=>nextWeek2Cols.map(()=>[]));
  const [amPrev1,setAmPrev1]=useState(()=>prevWeek1Cols.map(()=>[]));
  const [pmPrev1,setPmPrev1]=useState(()=>prevWeek1Cols.map(()=>[]));
  const [amPrev2,setAmPrev2]=useState(()=>prevWeek2Cols.map(()=>[]));
  const [pmPrev2,setPmPrev2]=useState(()=>prevWeek2Cols.map(()=>[]));
  const [amByDate,setAmByDate]=useState({});
  const [pmByDate,setPmByDate]=useState({});
  const [doneIds,setDoneIds]=useState(new Set());
  const [routines,setRoutines]=useState([]);
  const [trash,setTrash]=useState([]);
  const [editTodo,setEditTodo]=useState(null);
  const [showModal,setShowModal]=useState(false);
  const getWeekData = (w) => {
    if (w===1)  return { cols:nextWeek1Cols, am:amNext1, pm:pmNext1, setAm:setAmNext1, setPm:setPmNext1 };
    if (w===2)  return { cols:nextWeek2Cols, am:amNext2, pm:pmNext2, setAm:setAmNext2, setPm:setPmNext2 };
    if (w===-1) return { cols:prevWeek1Cols, am:amPrev1, pm:pmPrev1, setAm:setAmPrev1, setPm:setPmPrev1 };
    if (w===-2) return { cols:prevWeek2Cols, am:amPrev2, pm:pmPrev2, setAm:setAmPrev2, setPm:setPmPrev2 };
    return { cols:dateCols, am:amCols, pm:pmCols, setAm:setAmCols, setPm:setPmCols };
  };

  const handleReorder = useCallback((colId, fromIdx, toIdx) => {
    // fromIdx/toIdx は「表示順」(重要タスク先頭ソート後)のインデックス。
    // 表示順配列上で並び替え、その結果を新しい内部順として保存する。
    // (表示は常に再ソートされるため、重要タスク先頭の表示ルールは維持される)
    const reorder = arr => {
      if (!Number.isInteger(fromIdx) || !Number.isInteger(toIdx) ||
          fromIdx===toIdx || fromIdx<0 || toIdx<0 || fromIdx>=arr.length || toIdx>=arr.length) return arr;
      const display = [...arr].sort((a,b)=>(b.important?1:0)-(a.important?1:0));
      const [item] = display.splice(fromIdx,1);
      display.splice(toIdx,0,item);
      return display;
    };
    if (colId==="inbox") { setInbox(reorder); return; }
    const m=colId.match(/^d(\d+)-(am|pm)$/); if(!m) return;
    const di=+m[1], isAm=m[2]==="am";
    const {setAm,setPm}=getWeekData(boardWeek);
    const setter=isAm?setAm:setPm;
    setter(p=>{const n=[...p]; n[di]=reorder(n[di]); return n;});
  }, [boardWeek]);
  const sortDrag = useSortDrag({ onReorder: handleReorder });
  const [saveFlash,setSaveFlash]=useState(false);
  const [saveError,setSaveError]=useState(false);
  const [savePending,setSavePending]=useState(false);
  const [showSettings,setShowSettings]=useState(false);
  const importRef=useRef(null);
  const [layout,setLayout]=useState(()=>window.innerWidth<720?"stack":"board");

  useEffect(()=>{
    loadState(dateCols).then(s => {
      if (s?.loadError) {
        setAuthError("データの読み込みに失敗しました。再読み込みしてください。");
        setLoaded(true);
        return;
      }
      if (s) {
        const savedRoutines=s.routines||[];
        const {amCols:newAm,pmCols:newPm}=autoGenerateFromDefinitions(s.amCols,s.pmCols,savedRoutines,dateCols);
        setInbox(s.inbox); setAmCols(newAm); setPmCols(newPm); setDoneIds(s.doneIds); setRoutines(savedRoutines); setTrash(s.trash||[]);
        const abd=s.amByDate||{}, pbd=s.pmByDate||{};
        setAmByDate(abd); setPmByDate(pbd);
        setAmNext1(nextWeek1Cols.map(d=>abd[d.toDateString()]||[]));
        setPmNext1(nextWeek1Cols.map(d=>pbd[d.toDateString()]||[]));
        setAmNext2(nextWeek2Cols.map(d=>abd[d.toDateString()]||[]));
        setPmNext2(nextWeek2Cols.map(d=>pbd[d.toDateString()]||[]));
        setAmPrev1(prevWeek1Cols.map(d=>abd[d.toDateString()]||[]));
        setPmPrev1(prevWeek1Cols.map(d=>pbd[d.toDateString()]||[]));
        setAmPrev2(prevWeek2Cols.map(d=>abd[d.toDateString()]||[]));
        setPmPrev2(prevWeek2Cols.map(d=>pbd[d.toDateString()]||[]));
        setSavedHash(s.passwordHash||null); setIsNewUser(!s.passwordHash);
        if (urlUser==="main") { setAuthed(true); }
      } else {
        setIsNewUser(true);
        if (urlUser==="main") setAuthed(true);
      }
      setLoaded(true);
    });
  }, []);

  useEffect(()=>{ const fn=()=>setLayout(window.innerWidth<720?"stack":"board"); window.addEventListener("resize",fn); return()=>window.removeEventListener("resize",fn); },[]);
  useEffect(()=>{
    if (!loaded||!authed||boardWeek!==0||layout!=="stack") return;
    const timer=setTimeout(()=>{
      const el=document.getElementById("day-col-0-today-stack");
      if(el) el.scrollIntoView({block:"start",behavior:"auto"});
    },200);
    return ()=>clearTimeout(timer);
  },[loaded,authed,layout,boardWeek]);
  useEffect(()=>{
    if (!loaded||!authed) return;
    setSavePending(true);
    saveState({
      inbox,amCols,pmCols,doneIds,routines,trash,passwordHash:savedHash,
      amByDate,pmByDate,
      extraWeeks:[{cols:nextWeek1Cols,am:amNext1,pm:pmNext1},{cols:nextWeek2Cols,am:amNext2,pm:pmNext2}]
    }, dateCols,
      ()=>{ setSavePending(false); setSaveError(true); setSaveFlash(false); },
      ()=>{ setSavePending(false); setSaveError(false); setSaveFlash(true); setTimeout(()=>setSaveFlash(false),2200); }
    );
  },[inbox,amCols,pmCols,amNext1,pmNext1,amNext2,pmNext2,amByDate,pmByDate,doneIds,routines,trash,loaded,authed]);

  // colId helpers
  const parseColId = c => { if(c==="inbox")return{type:"inbox"}; const m=c.match(/^d(\d+)-(am|pm)$/); if(m)return{type:m[2],dayIndex:+m[1]}; return null; };
  const removeFromAll = useCallback(id => {
    setInbox(p=>p.filter(t=>t.id!==id));
    setAmCols(p=>p.map(c=>c.filter(t=>t.id!==id)));
    setPmCols(p=>p.map(c=>c.filter(t=>t.id!==id)));
    setAmNext1(p=>p.map(c=>c.filter(t=>t.id!==id)));
    setPmNext1(p=>p.map(c=>c.filter(t=>t.id!==id)));
    setAmNext2(p=>p.map(c=>c.filter(t=>t.id!==id)));
    setPmNext2(p=>p.map(c=>c.filter(t=>t.id!==id)));
  }, []);
  const addToCol = useCallback((todo, colId, week=0) => {
    const p=parseColId(colId); if(!p) return;
    if (p.type==="inbox") setInbox(prev=>[...prev,todo]);
    else {
      const setter = week===1
        ? (p.type==="am"?setAmNext1:setPmNext1)
        : week===2
          ? (p.type==="am"?setAmNext2:setPmNext2)
          : (p.type==="am"?setAmCols:setPmCols);
      setter(prev=>{const n=[...prev]; n[p.dayIndex]=[...n[p.dayIndex],todo]; return n;});
    }
  }, []);

  // CRUD
  const handleEdit   = (todo,colId) => { setEditTodo({todo,colId,week:colId==="inbox"?0:boardWeek}); setShowModal(true); };
  const handleAdd    = colId => { setEditTodo({todo:{id:null,text:"",routine:null},colId,week:colId==="inbox"?0:boardWeek}); setShowModal(true); };
  const handleToggle = id => {
    const now=Date.now();
    setDoneIds(p=>{const n=new Set(p); n.has(id)?n.delete(id):n.add(id); return n;});
    const upd=l=>l.map(t=>t.id===id?{...t,lastCheckedAt:now}:t);
    setInbox(upd);
    setAmCols(p=>p.map(upd)); setPmCols(p=>p.map(upd));
    setAmNext1(p=>p.map(upd)); setPmNext1(p=>p.map(upd));
    setAmNext2(p=>p.map(upd)); setPmNext2(p=>p.map(upd));
  };
  const handleDelete = id => {
    const target=allTodos.find(t=>t.id===id);
    if (target) setTrash(p=>[...p,{...target,deletedAt:Date.now()}]);
    removeFromAll(id); setDoneIds(p=>{const n=new Set(p); n.delete(id); return n;});
  };
  const handleRestore = item => {
    const {deletedAt:_,...todo}=item;
    setInbox(p=>[...p,{...todo,id:genId()}]);
    setTrash(p=>p.filter(t=>t.id!==item.id));
  };
  const handleSave = updated => {
    if (!editTodo) return;
    const targetWeek=editTodo.week ?? 0;
    if (!updated.id) {
      const base=stampTodo({...updated,id:genId()});
      const {cols:activeCols}=getWeekData(targetWeek);
      const colIds=resolveColIds(base,activeCols);
      if (colIds?.length) {
        const {setAm,setPm}=getWeekData(targetWeek);
        colIds.forEach(colId=>{ const p=parseColId(colId); if(!p)return; if(p.type==="inbox")setInbox(prev=>[...prev,{...base,id:genId()}]); else if(p.type==="am")setAm(prev=>{const n=[...prev];n[p.dayIndex]=[...n[p.dayIndex],{...base,id:genId()}];return n;}); else setPm(prev=>{const n=[...prev];n[p.dayIndex]=[...n[p.dayIndex],{...base,id:genId()}];return n;}); });
      } else addToCol(base, editTodo.colId, targetWeek);
    } else {
      const {cols:activeCols}=getWeekData(targetWeek);
      const colIds=resolveColIds(updated,activeCols);
      if (colIds?.length) {
        removeFromAll(updated.id);
        const {setAm,setPm}=getWeekData(targetWeek);
        colIds.forEach(colId=>{ const p=parseColId(colId); if(!p)return; if(p.type==="inbox")setInbox(prev=>[...prev,{...updated,id:genId()}]); else if(p.type==="am")setAm(prev=>{const n=[...prev];n[p.dayIndex]=[...n[p.dayIndex],{...updated,id:genId()}];return n;}); else setPm(prev=>{const n=[...prev];n[p.dayIndex]=[...n[p.dayIndex],{...updated,id:genId()}];return n;}); });
      } else {
        const upd=l=>l.map(t=>t.id===updated.id?updated:t);
        setInbox(upd);
        setAmCols(p=>p.map(upd)); setPmCols(p=>p.map(upd));
        setAmNext1(p=>p.map(upd)); setPmNext1(p=>p.map(upd));
        setAmNext2(p=>p.map(upd)); setPmNext2(p=>p.map(upd));
      }
    }
    setShowModal(false); setEditTodo(null);
  };
  const handleQuickAdd = todos => {
    const newAm=amCols.map(c=>[...c]), newPm=pmCols.map(c=>[...c]);
    let newInbox=[...inbox], newRoutines=[...routines];
    todos.forEach(todo => {
      const s=stampTodo(todo);
      const isRtn=["weekly","daily","monthly","nweekly","ndaily"].includes(s.routine?.type);
      const colIds=resolveColIds(s,dateCols);
      if (isRtn) {
        const exists=newRoutines.some(r=>r.text===s.text && sameRoutine(r.routine, s.routine));
        if (!exists) {
          const def={id:genId(),text:s.text,routine:s.routine,slotHint:s.slotHint||"am",active:true,expiresAt:null};
          newRoutines=[...newRoutines,def];
          colIds?.forEach(colId=>{ const m=colId.match(/^d(\d+)-(am|pm)$/); if(!m)return; const di=+m[1],isAm=m[2]==="am"; const task=stampTodo({...s,id:genId(),routineDefId:def.id,lastCheckedAt:null}); if(isAm)newAm[di]=[...newAm[di],task]; else newPm[di]=[...newPm[di],task]; });
        }
      } else if (colIds?.length) {
        colIds.forEach(colId=>{ const m=colId.match(/^d(\d+)-(am|pm)$/); if(!m)return; const di=+m[1],isAm=m[2]==="am"; if(isAm)newAm[di]=[...newAm[di],{...s,id:genId()}]; else newPm[di]=[...newPm[di],{...s,id:genId()}]; });
      } else newInbox=[...newInbox,s];
    });
    setInbox(newInbox); setAmCols(newAm); setPmCols(newPm); setRoutines(newRoutines);
  };

  // Routine CRUD
  const applyRoutineDef = def => {
    const r=syncRoutineDefinition(amCols,pmCols,def,dateCols);
    setAmCols(r.amCols); setPmCols(r.pmCols);
    if(r.removedIds.length) setDoneIds(p=>{const n=new Set(p);r.removedIds.forEach(id=>n.delete(id));return n;});
  };
  const handleAddRoutine = def => { setRoutines(p=>[...p,def]); applyRoutineDef(def); };
  const handleUpdateRoutine = def => { setRoutines(p=>p.map(r=>r.id===def.id?def:r)); applyRoutineDef(def); };
  const handleDeleteRoutine = id => {
    const removedIds=[...amCols.flat(),...pmCols.flat()].filter(t=>t.routineDefId===id).map(t=>t.id);
    setRoutines(p=>p.filter(r=>r.id!==id));
    setAmCols(p=>p.map(c=>c.filter(t=>t.routineDefId!==id))); setPmCols(p=>p.map(c=>c.filter(t=>t.routineDefId!==id)));
    if(removedIds.length) setDoneIds(p=>{const n=new Set(p);removedIds.forEach(taskId=>n.delete(taskId));return n;});
  };
  const handleToggleRoutine = id => { const def=routines.find(r=>r.id===id); if(def) handleUpdateRoutine({...def,active:!def.active}); };
  // Auth
  const handleAuth = async (pw, pw2) => {
    if (!pw.trim()) { setAuthError("パスワードを入力してください"); return; }
    let hash;
    try {
      if (!window.crypto?.subtle) throw new Error("Web Crypto unsupported");
      hash=await hashPassword(pw);
    } catch(e) {
      console.error("password hash error", e);
      setAuthError("このブラウザではログイン処理を利用できません。OS・ブラウザを更新してください。");
      return;
    }
    if (isNewUser) {
      if (pw!==pw2) { setAuthError("パスワードが一致しません"); return; }
      if (pw.length<4) { setAuthError("4文字以上で設定してください"); return; }
      setSavedHash(hash); setAuthed(true); setAuthError("");
      setTimeout(()=>saveState({inbox,amCols,pmCols,doneIds,routines,trash,passwordHash:hash},dateCols),100);
    } else {
      if (hash!==savedHash) { setAuthError("パスワードが違います"); return; }
      setAuthed(true); setAuthError("");
    }
  };

  const allTodos = useMemo(() =>
    [...inbox,
     ...amCols.flat(), ...pmCols.flat(),
     ...amNext1.flat(), ...pmNext1.flat(),
     ...amNext2.flat(), ...pmNext2.flat(),
     ...amPrev1.flat(), ...pmPrev1.flat(),
     ...amPrev2.flat(), ...pmPrev2.flat()],
    [inbox,amCols,pmCols,amNext1,pmNext1,amNext2,pmNext2,amPrev1,pmPrev1,amPrev2,pmPrev2]
  );
  const TODAY = useMemo(()=>{ const d=new Date(); d.setHours(0,0,0,0); return d; }, []);
  const sp={doneIds,onEdit:(t,c)=>handleEdit(t,c),onDelete:handleDelete,onToggle:handleToggle,onAdd:handleAdd,sortDrag};
  const badge=(n,bg)=><span style={{position:"absolute",top:-6,right:-6,background:bg,color:"#fff",fontSize:10,fontWeight:700,borderRadius:10,padding:"1px 6px"}}>{n}</span>;

  if (!loaded) return <div style={{minHeight:"100vh",background:"#f5f6f8",display:"flex",alignItems:"center",justifyContent:"center",...FONT_STYLE}}><div style={{textAlign:"center"}}><div style={{fontSize:28,marginBottom:12}}>📋</div><div style={{fontSize:13,color:"#aaa"}}>読み込んでいます…</div></div></div>;
  if (!authed) return <LockScreen isNew={isNewUser} onAuth={handleAuth} error={authError}/>;

  // ── バックアップ ──────────────────────────────────────────────────────────
  const handleExport = () => {
    // 今週・来週・再来週の最新stateをamByDate/pmByDateにマージしてから書き出す
    // (過去週はamByDate/pmByDateに既に保持されている)
    const mergedAm = { ...amByDate }, mergedPm = { ...pmByDate };
    dateCols.forEach((d,i)=>{ mergedAm[d.toDateString()]=amCols[i]; mergedPm[d.toDateString()]=pmCols[i]; });
    nextWeek1Cols.forEach((d,i)=>{ mergedAm[d.toDateString()]=amNext1[i]; mergedPm[d.toDateString()]=pmNext1[i]; });
    nextWeek2Cols.forEach((d,i)=>{ mergedAm[d.toDateString()]=amNext2[i]; mergedPm[d.toDateString()]=pmNext2[i]; });
    const exportData = {
      version: 2,
      user: urlUser,
      exportedAt: new Date().toISOString(),
      inbox, amCols, pmCols,
      amByDate: mergedAm, pmByDate: mergedPm,
      doneIds: [...doneIds],
      routines, trash,
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `taskboard_${urlUser}_${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setShowSettings(false);
  };

  const handleImport = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        if (typeof ev.target?.result !== "string") { alert("ファイル読み込みエラー"); return; }
        const d = JSON.parse(ev.target.result);
        if (!d.version || !d.inbox) { alert("無効なバックアップファイルです"); return; }
        if (d.user && d.user !== urlUser) {
          if (!window.confirm(`このバックアップは「${d.user}」のデータです。「${urlUser}」に上書きしますか？`)) return;
        }
        // v2: amByDate/pmByDateを含む完全バックアップ / v1: 今週分のみ(旧形式互換)
        const abd = d.amByDate ?? {}, pbd = d.pmByDate ?? {};
        const hasDatedData = d.version>=2 && Object.keys(abd).length>0 && Object.keys(pbd).length>0;
        setAmByDate(abd); setPmByDate(pbd);
        setInbox(d.inbox ?? []);
        setAmCols(hasDatedData ? dateCols.map(dt=>abd[dt.toDateString()]||[]) : (d.amCols ?? dateCols.map(()=>[])));
        setPmCols(hasDatedData ? dateCols.map(dt=>pbd[dt.toDateString()]||[]) : (d.pmCols ?? dateCols.map(()=>[])));
        setAmNext1(nextWeek1Cols.map(dt=>abd[dt.toDateString()]||[]));
        setPmNext1(nextWeek1Cols.map(dt=>pbd[dt.toDateString()]||[]));
        setAmNext2(nextWeek2Cols.map(dt=>abd[dt.toDateString()]||[]));
        setPmNext2(nextWeek2Cols.map(dt=>pbd[dt.toDateString()]||[]));
        setAmPrev1(prevWeek1Cols.map(dt=>abd[dt.toDateString()]||[]));
        setPmPrev1(prevWeek1Cols.map(dt=>pbd[dt.toDateString()]||[]));
        setAmPrev2(prevWeek2Cols.map(dt=>abd[dt.toDateString()]||[]));
        setPmPrev2(prevWeek2Cols.map(dt=>pbd[dt.toDateString()]||[]));
        setDoneIds(new Set(d.doneIds ?? []));
        setRoutines(d.routines ?? []);
        setTrash(d.trash ?? []);
        setShowSettings(false);
        alert("✅ バックアップを復元しました！");
      } catch { alert("ファイルの読み込みに失敗しました"); }
    };
    reader.readAsText(file);
    e.target.value = ""; // 同じファイルを再選択できるようリセット
  };

  const boardContent = (()=>{
    if (tab !== "board") return null;
    const {cols,am,pm}=getWeekData(boardWeek);
    const isReadOnly=boardWeek===-1||boardWeek===-2;
    const wkAccents=[PINK,"#c9437a","#be4280","#b34186","#a8408c","#9e3f8e","#934090"];
    const pastAccents=["#aaa","#999","#888","#888","#999","#aaa","#bbb"];
    const colAccents=isReadOnly?pastAccents:wkAccents;
    const isToday=date=>date.toDateString()===TODAY.toDateString();
    if (isReadOnly) {
      if (layout==="stack") {
        return (
          <div style={{display:"flex",flexDirection:"column",gap:12,overflowY:"auto",WebkitOverflowScrolling:"touch",flex:1,padding:"0 12px calc(96px + env(safe-area-inset-bottom))"}}>
            {cols.map((date,i)=>(
              <div key={i} style={{...FONT_STYLE,background:"#fff",border:"1.5px solid #e8e8e8",borderRadius:14,padding:"12px",opacity:0.88}}>
                <div style={{fontSize:14,fontWeight:700,color:"#888",marginBottom:8}}>{fmtDate(date)}（{DAYS_JP[date.getDay()]}）</div>
                <div style={{display:"flex",flexDirection:"column",gap:6}}>
                  <ReadonlySlot isAm={true} todos={am[i]} doneIds={doneIds}/>
                  <ReadonlySlot isAm={false} todos={pm[i]} doneIds={doneIds}/>
                </div>
              </div>
            ))}
          </div>
        );
      }
      return (
        <div style={{display:"flex",gap:12,overflowX:"auto",paddingBottom:16,alignItems:"flex-start"}}>
          {cols.map((date,i)=>(
            <div key={i} style={{minWidth:240,width:260,flexShrink:0,...FONT_STYLE,background:"#fff",border:"1.5px solid #e8e8e8",borderRadius:14,padding:"12px",opacity:0.88}}>
              <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:10}}>
                <div style={{width:3,height:14,background:colAccents[i],borderRadius:2}}/>
                <div style={{fontSize:14,fontWeight:700,color:"#888"}}>{fmtDate(date)}（{DAYS_JP[date.getDay()]}）</div>
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:6}}>
                <ReadonlySlot isAm={true} todos={am[i]} doneIds={doneIds}/>
                <ReadonlySlot isAm={false} todos={pm[i]} doneIds={doneIds}/>
              </div>
            </div>
          ))}
        </div>
      );
    }
    if (layout==="stack") {
      return (
        <div style={{overflowY:"auto",WebkitOverflowScrolling:"touch",flex:1,padding:"0 10px calc(96px + env(safe-area-inset-bottom))",boxSizing:"border-box"}}>
            {boardWeek===0 && <QuickEntry onAdd={handleQuickAdd} dateCols={cols}/>} 
            {boardWeek!==0 && <div style={{padding:"4px 0 6px",fontSize:11,color:"#aaa"}}>{isReadOnly?"👁 閲覧のみ — 過去の記録":""}</div>}
            {cols.map((date,i)=>(
              <div key={`${boardWeek}-${i}`} id={boardWeek===0&&isToday(date)?"day-col-0-today-stack":undefined}>
                <MobileDaySection defaultOpen={boardWeek===0?isToday(date):i===0} dayIndex={i} date={date} accent={isToday(date)?PINK:colAccents[i]} amTodos={am[i]} pmTodos={pm[i]} {...sp} onEdit={(t,c)=>handleEdit(t,c)} isToday={isToday(date)}/>
              </div>
            ))}
          </div>
      );
    }
    return (
      <div style={{flex:1,display:"flex",overflow:"hidden"}}>
        {boardWeek===0 && (
          <div style={{width:220,flexShrink:0,display:"flex",flexDirection:"column",gap:10,padding:"0 0 20px 0",borderRight:"1px solid #e8e8e8",overflowY:"auto"}}>
            <QuickEntry onAdd={handleQuickAdd} dateCols={cols}/>
          </div>
        )}
        <div style={{flex:1,overflowX:"auto",overflowY:"auto",padding:"0 0 24px 14px",WebkitOverflowScrolling:"touch"}}>
          {boardWeek===0 && getTodayColIndex(cols)>=0 && (
            <div style={{display:"flex",justifyContent:"flex-end",marginBottom:8}}>
              <button onClick={()=>{ const el=document.getElementById(`day-col-${boardWeek}-today`); el?.scrollIntoView({behavior:"smooth",inline:"start",block:"nearest"}); }} style={{...FONT_STYLE,fontSize:11,fontWeight:700,color:PINK,background:PINK_LIGHT,border:`1px solid ${PINK}44`,borderRadius:99,padding:"4px 12px",cursor:"pointer"}}>📍 今日に戻る</button>
            </div>
          )}
          <div style={{display:"flex",gap:14,alignItems:"flex-start",paddingBottom:16}}>
            {(boardWeek===0?[...cols.filter(d=>d<TODAY&&!isToday(d)),...cols.filter(d=>d>=TODAY||isToday(d))]:cols).map((date)=>{
              const i=cols.indexOf(date);
              const past=boardWeek===0&&date<TODAY&&!isToday(date);
              return (
                <div key={i} id={isToday(date)?`day-col-${boardWeek}-today`:`day-col-${boardWeek}-${i}`} style={{minWidth:260,maxWidth:300,width:280,flexShrink:0,opacity:past?0.7:1}}>
                  <DayColumn dayIndex={i} date={date} accent={isToday(date)?PINK:colAccents[i]} amTodos={am[i]} pmTodos={pm[i]} {...sp} onEdit={(t,c)=>handleEdit(t,c)} isToday={isToday(date)}/>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  })();

  return (
    <div style={{...FONT_STYLE,height:layout==="stack"?"100dvh":"auto",minHeight:layout==="stack"?"unset":"100vh",background:"#f5f6f8",display:layout==="stack"?"flex":"block",flexDirection:"column",overflow:"hidden",boxSizing:"border-box"}}>
      <div style={{marginBottom:layout==="stack"?8:16,padding:layout==="stack"?"calc(8px + env(safe-area-inset-top)) 12px 4px":"0",display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0,gap:6}}>
        <div style={{display:"flex",alignItems:layout==="stack"?"flex-start":"baseline",flexDirection:layout==="stack"?"column":"row",gap:layout==="stack"?1:20}}>
          <h1 style={{...FONT_STYLE,margin:0,fontSize:layout==="stack"?10:20,fontWeight:700,color:layout==="stack"?"#999":"#0d0d0d",letterSpacing:layout==="stack"?".08em":"normal"}}>TASK BOARD</h1>
          <div style={{...FONT_STYLE,fontSize:layout==="stack"?15:13,fontWeight:layout==="stack"?700:400,color:"#0d0d0d"}}>{layout==="stack"?`${new Date().getMonth()+1}月${new Date().getDate()}日（${DAYS_JP[new Date().getDay()]}）`:`${new Date().getFullYear()}年${new Date().getMonth()+1}月${new Date().getDate()}日 (${DAYS_JP[new Date().getDay()]})`}</div>
          {urlUser!=="main" && <div style={{...FONT_STYLE,fontSize:11,fontWeight:700,color:"#fff",background:PINK,borderRadius:20,padding:"2px 10px"}}>{urlUser}</div>}
        </div>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          {/* PC時のみタブをヘッダー右に表示 */}
          {layout!=="stack" && [["board","📋 ボード"],["inbox","📥 ストック"],["routines","🔁 管理"],["trash","🗑"],["guide","📖"]].map(([key,label])=>(
            <button key={key} onClick={()=>setTab(key)} style={{...FONT_STYLE,padding:"5px 11px",borderRadius:7,fontSize:12,fontWeight:700,cursor:"pointer",border:"1.5px solid",position:"relative",flexShrink:0,background:tab===key?"#0d0d0d":"#fff",color:tab===key?"#fff":"#555",borderColor:tab===key?"#0d0d0d":"#e0e0e0"}}>
              {label}
              {key==="inbox"&&inbox.length>0 && badge(inbox.length,PINK)}
              {key==="routines"&&routines.filter(r=>r.active).length>0 && badge(routines.filter(r=>r.active).length,"#555")}
              {key==="trash"&&trash.length>0 && badge(trash.length,"#aaa")}
            </button>
          ))}
          {layout!=="stack" && <div style={{width:1,height:20,background:"#e0e0e0",margin:"0 2px"}}/>}
          <div style={{...FONT_STYLE,fontSize:layout==="stack"?9:12,color:saveError?"#cc3333":savePending?"#999":saveFlash?"#1b7a3a":"#bbb",transition:"color .25s",whiteSpace:"nowrap"}}>{saveError?"⚠ 保存失敗":savePending?"保存中…":saveFlash?"✓ 保存済み":""}</div>
          <button onClick={()=>setShowSettings(true)} style={{width:44,height:44,background:"#fff",border:"1px solid #e4e4e4",borderRadius:12,cursor:"pointer",fontSize:20,color:"#777",padding:0,lineHeight:1}} title="バックアップ・設定">⚙️</button>
        </div>
      </div>

      {/* 設定モーダル */}
      {showSettings && (
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.45)",display:"flex",alignItems:"flex-end",justifyContent:"center",zIndex:3000}} onClick={()=>setShowSettings(false)}>
          <div style={{...FONT_STYLE,background:"#fff",borderRadius:"20px 20px 0 0",padding:"24px 20px",paddingBottom:"calc(28px + env(safe-area-inset-bottom))",width:"100%",maxWidth:480,boxShadow:"0 -4px 24px rgba(0,0,0,.12)"}} onClick={e=>e.stopPropagation()}>
            <div style={{width:40,height:4,background:"#ddd",borderRadius:2,margin:"0 auto 20px"}}/>
            <div style={{fontSize:15,fontWeight:700,color:"#0d0d0d",marginBottom:6}}>⚙️ バックアップ・設定</div>
            <div style={{fontSize:12,color:"#aaa",marginBottom:20}}>データをJSONファイルで保存・復元できます</div>

            {/* エクスポート */}
            <div style={{background:"#f2faf2",border:"1.5px solid #8ed08e",borderRadius:12,padding:"16px",marginBottom:12}}>
              <div style={{fontSize:13,fontWeight:700,color:"#2a6e2a",marginBottom:4}}>💾 バックアップを保存</div>
              <div style={{fontSize:11,color:"#888",marginBottom:12}}>現在のデータをJSONファイルとしてダウンロードします</div>
              <button onClick={handleExport} style={{...FONT_STYLE,width:"100%",padding:"10px",background:"#3a9e3a",color:"#fff",fontWeight:700,fontSize:13,borderRadius:8,border:"none",cursor:"pointer"}}>
                ⬇️ ダウンロード（{new Date().toISOString().slice(0,10)}）
              </button>
            </div>

            {/* インポート */}
            <div style={{background:"#fff8f0",border:"1.5px solid #f5a55a",borderRadius:12,padding:"16px",marginBottom:20}}>
              <div style={{fontSize:13,fontWeight:700,color:"#a04010",marginBottom:4}}>📂 バックアップから復元</div>
              <div style={{fontSize:11,color:"#888",marginBottom:12}}>⚠️ 現在のデータはバックアップファイルで上書きされます</div>
              <button onClick={()=>importRef.current?.click()} style={{...FONT_STYLE,width:"100%",padding:"10px",background:"#e06010",color:"#fff",fontWeight:700,fontSize:13,borderRadius:8,border:"none",cursor:"pointer"}}>
                ⬆️ ファイルを選択して復元
              </button>
              <input ref={importRef} type="file" accept=".json" onChange={handleImport} style={{display:"none"}}/>
            </div>

            <button onClick={()=>setShowSettings(false)} style={{...FONT_STYLE,width:"100%",padding:"11px",background:"#f5f5f5",border:"1.5px solid #e0e0e0",borderRadius:8,fontSize:14,fontWeight:700,color:"#666",cursor:"pointer"}}>閉じる</button>
          </div>
        </div>
      )}

      {/* ── 週タブ：過去→現在→未来 ── */}
      {tab==="board" && (
        <div style={{display:"flex",gap:6,marginBottom:layout==="stack"?12:8,overflowX:"auto",WebkitOverflowScrolling:"touch",scrollbarWidth:"none",msOverflowStyle:"none",flexShrink:0,padding:layout==="stack"?"0 12px":"0"}}>
          {[[-2,"先々週",true],[-1,"先週",true],[0,"今週",false],[1,"来週",false],[2,"再来週",false]].map(([w,label,readOnly])=>{
            const isActive=boardWeek===w;
            return (
              <button key={w} onClick={()=>setBoardWeek(w)} style={{...FONT_STYLE,padding:layout==="stack"?"7px 10px":"5px 14px",borderRadius:20,fontSize:layout==="stack"?11:12,fontWeight:700,cursor:"pointer",border:"1.5px solid",flexShrink:0,
                background:isActive?(readOnly?"#888":PINK):"#fff",
                color:isActive?"#fff":(readOnly?"#aaa":"#555"),
                borderColor:isActive?(readOnly?"#888":PINK):(readOnly?"#e8e8e8":"#e0e0e0")}}>
                {w===0?"🗓 今週":label}
              </button>
            );
          })}
          {(boardWeek===-1||boardWeek===-2) && <span style={{...FONT_STYLE,fontSize:11,color:"#aaa",alignSelf:"center"}}>👁 閲覧のみ</span>}
        </div>
      )}
      {tab==="guide" ? <div style={{flex:layout==="stack"?1:"unset",overflowY:layout==="stack"?"auto":"visible",padding:layout==="stack"?"0 12px calc(96px + env(safe-area-inset-bottom))":"0"}}><QuickGuide/></div>
      :tab==="trash" ? <div style={{flex:layout==="stack"?1:"unset",overflowY:layout==="stack"?"auto":"visible",padding:layout==="stack"?"0 12px calc(96px + env(safe-area-inset-bottom))":"0"}}><TrashBin trash={trash} onRestore={handleRestore} onPermanentDelete={id=>setTrash(p=>p.filter(t=>t.id!==id))} onClearAll={()=>setTrash([])}/></div>
      :tab==="routines" ? <div style={{flex:layout==="stack"?1:"unset",overflowY:layout==="stack"?"auto":"visible",padding:layout==="stack"?"0 12px calc(96px + env(safe-area-inset-bottom))":"0"}}><RoutineManager routines={routines} onAdd={handleAddRoutine} onUpdate={handleUpdateRoutine} onDelete={handleDeleteRoutine} onToggle={handleToggleRoutine}/></div>
      :tab==="inbox" ? <div style={{flex:layout==="stack"?1:"unset",overflowY:layout==="stack"?"auto":"visible",padding:layout==="stack"?"0 12px calc(96px + env(safe-area-inset-bottom))":"0"}}><InboxPage todos={inbox} {...sp} onAdd={()=>handleAdd("inbox")} onQuickAdd={handleQuickAdd} dateCols={dateCols}/></div>

      :boardContent}
      {layout==="stack" && <nav aria-label="メインナビゲーション" style={{position:"fixed",left:0,right:0,bottom:0,zIndex:1500,display:"grid",gridTemplateColumns:"repeat(5,1fr)",background:"rgba(255,255,255,.96)",borderTop:"1px solid #ddd",boxShadow:"0 -4px 18px rgba(0,0,0,.08)",padding:"6px 6px calc(6px + env(safe-area-inset-bottom))",backdropFilter:"blur(12px)",WebkitBackdropFilter:"blur(12px)"}}>
        {[["board","📋","ボード"],["inbox","📥","ストック"],["routines","🔁","ルーティン"],["trash","🗑","ゴミ箱"],["guide","📖","使い方"]].map(([key,icon,label])=>(
          <button key={key} onClick={()=>setTab(key)} style={{...FONT_STYLE,position:"relative",minHeight:52,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:2,background:"transparent",border:"none",borderRadius:10,color:tab===key?PINK:"#777",fontSize:9,fontWeight:tab===key?700:500,cursor:"pointer"}}>
            <span style={{fontSize:19,lineHeight:1}}>{icon}</span><span>{label}</span>
            {key==="inbox"&&inbox.length>0 && badge(inbox.length,PINK)}
            {key==="trash"&&trash.length>0 && badge(trash.length,"#888")}
          </button>
        ))}
      </nav>}
      {layout!=="stack" && <div style={{...FONT_STYLE,marginTop:14,fontSize:11,color:"#bbb"}}>💡 ✏️ 編集から重要マーク設定、ドラッグハンドルで並び替えができます</div>}
      {showModal&&editTodo && <EditModal todo={editTodo.todo} onSave={handleSave} onClose={()=>{setShowModal(false);setEditTodo(null);}}/>}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App/>);
