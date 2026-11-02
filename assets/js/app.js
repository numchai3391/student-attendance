/* ระบบเช็คชื่อ — ตรรกะหน้าเว็บ */
(() => {
  'use strict';
  const CFG = window.APP_CONFIG;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pad = n => String(n).padStart(2, '0');
  const todayISO = () => { const t = new Date(); return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`; };
  const TH = 'th-TH-u-ca-buddhist';
  const dateOf = iso => new Date(iso + 'T00:00:00');
  const thDay = iso => dateOf(iso).toLocaleDateString(TH, { weekday: 'long' });
  const thLong = iso => dateOf(iso).toLocaleDateString(TH, { day: 'numeric', month: 'long', year: 'numeric' });
  const thShort = iso => dateOf(iso).toLocaleDateString(TH, { day: 'numeric', month: 'short', year: '2-digit' });
  const fmtPct = (n, t) => { if (!t) return '0%'; const p = n / t * 100; return (Number.isInteger(p) ? p : p.toFixed(1)) + '%'; };

  const STATUS = [
    { k: 'มา', c: 'ok' }, { k: 'สาย', c: 'late' }, { k: 'ขาด', c: 'absent' }, { k: 'ลา', c: 'leave' }
  ];
  const cls_of = k => (STATUS.find(s => s.k === k) || {}).c || 'none';

  const S = {
    students: [], page: 'attend',
    subject: '', cls: '', period: 0, date: todayISO(),
    att: {}, existing: false, tok: 0,
    mode: 'attend', scanStatus: 'มา', scoreVal: 1, scoreTitle: '',
    scanLog: [], sum: null, rows: []
  };

  /* ---------- ข้อมูลนักเรียน ---------- */
  const keyOf = s => s.code || s.subject;
  const subjects = () => {
    const m = new Map();
    S.students.forEach(s => { const k = keyOf(s); if (!m.has(k)) m.set(k, { key: k, code: s.code, name: s.subject }); });
    return [...m.values()];
  };
  const classesOf = key => [...new Set(S.students.filter(s => keyOf(s) === key).map(s => s.cls))].sort((a, b) => a.localeCompare(b, 'th', { numeric: true }));
  const roster = () => S.students
    .filter(s => keyOf(s) === S.subject && s.cls === S.cls)
    .sort((a, b) => String(a.no).localeCompare(String(b.no), 'th', { numeric: true }));
  const subjInfo = () => subjects().find(x => x.key === S.subject);
  const fullName = s => `${s.first} ${s.last}`.trim();
  const ready = () => !!(S.subject && S.cls && S.period);

  /* ---------- UI พื้นฐาน ---------- */
  let busyN = 0;
  const busy = on => { busyN = Math.max(0, busyN + (on ? 1 : -1)); $('#loader').classList.toggle('on', busyN > 0); };

  const ICON = {
    success: '<svg viewBox="0 0 24 24" width="56" height="56" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    error: '<svg viewBox="0 0 24 24" width="52" height="52" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    warn: '<svg viewBox="0 0 24 24" width="52" height="52" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round"><path d="M12 5v9M12 19v.01"/></svg>'
  };
  let toastTimer;
  function toast({ type = 'success', title, text = '', ms }) {
    const w = $('#toast');
    w.className = `toast-wrap show t-${type}`;
    w.innerHTML = `<div class="toast"><div class="t-ico">${ICON[type]}</div><div class="t-title">${esc(title)}</div><div class="t-text">${esc(text)}</div></div>`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => w.classList.remove('show'), ms || (type === 'success' ? 2100 : 3400));
  }

  let actx;
  function beep(ok) {
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      const o = actx.createOscillator(), g = actx.createGain();
      o.type = 'sine'; o.frequency.value = ok ? 880 : 220; g.gain.value = .06;
      o.connect(g); g.connect(actx.destination); o.start(); o.stop(actx.currentTime + (ok ? .09 : .28));
    } catch { /* ไม่มีเสียงก็ไม่เป็นไร */ }
  }

  function openModal(html) {
    $('#modalCard').innerHTML = `<button class="m-x" data-close aria-label="ปิด">×</button>${html}`;
    $('#modal').hidden = false;
  }
  const closeModal = () => { $('#modal').hidden = true; focusScan(); };
  const emptyHtml = (msg, extra = '') => `<div class="empty"><svg viewBox="0 0 24 24" width="64" height="64" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5"/><path d="M17 5.5a3 3 0 0 1 0 5.8M18.5 14.8c1.8.6 3 2.3 3.3 5.2"/></svg><p>${esc(msg)}</p>${extra}</div>`;

  /* ---------- Selectors + Banner ---------- */
  function fillSubjects() {
    $('#selSubject').innerHTML = '<option value="">— เลือกรายวิชา —</option>' +
      subjects().map(x => `<option value="${esc(x.key)}">${esc(x.code ? x.code + ' · ' : '')}${esc(x.name)}</option>`).join('');
    $('#selSubject').value = S.subject;
  }
  function fillClasses() {
    const list = S.subject ? classesOf(S.subject) : [];
    $('#selClass').innerHTML = '<option value="">— เลือกชั้น —</option>' + list.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
    $('#selClass').value = list.includes(S.cls) ? S.cls : '';
    S.cls = $('#selClass').value;
  }
  function renderPeriods() {
    $('#periods').innerHTML = Array.from({ length: CFG.PERIODS || 9 }, (_, i) =>
      `<button type="button" class="pbtn ${S.period === i + 1 ? 'on' : ''}" data-p="${i + 1}">${i + 1}</button>`).join('');
  }
  function renderBanner() {
    const info = subjInfo();
    const tiles = [
      { l: 'รายวิชา', v: info ? info.name : '—', s: info && info.code ? 'รหัสวิชา ' + info.code : '' },
      { l: 'ชั้น', v: S.cls || '—' }
    ];
    if (S.page !== 'summary') {
      tiles.push({ l: 'คาบที่', v: S.period || '—', big: true }, { l: thDay(S.date), v: thLong(S.date) });
    }
    const b = $('#banner');
    b.className = `banner cols-${tiles.length}`;
    b.innerHTML = tiles.map(t => `<div class="bt ${t.big ? 'big' : ''}"><div class="bt-l">${esc(t.l)}</div><div class="bt-v ${t.v === '—' ? 'dim' : ''}">${esc(t.v)}</div>${t.s ? `<div class="bt-s">${esc(t.s)}</div>` : ''}</div>`).join('');
  }
  function applyPageChrome() {
    $$('[data-need="session"]').forEach(el => el.hidden = S.page === 'summary');
    $$('.tab').forEach(t => t.classList.toggle('on', t.dataset.page === S.page));
    ['attend', 'scan', 'summary'].forEach(p => $('#pg-' + p).hidden = p !== S.page);
  }
  const saveCtx = () => { try { localStorage.setItem('chk_ctx', JSON.stringify({ subject: S.subject, cls: S.cls })); } catch { } };

  async function refresh() {
    renderBanner(); renderPeriods(); applyPageChrome();
    if (S.page === 'summary') { await loadSummary(); return; }
    await loadSession();
    if (S.page === 'attend') renderRoster(); else renderScan();
  }

  async function loadSession() {
    S.att = {}; S.existing = false;
    if (!ready()) return;
    const tok = ++S.tok; busy(1);
    try {
      const recs = await API.session({ date: S.date, period: S.period, key: S.subject, cls: S.cls });
      if (tok !== S.tok) return;
      recs.forEach(r => { S.att[r.sid] = r.status; });
      S.existing = recs.length > 0;
    } catch (e) { toast({ type: 'error', title: 'โหลดข้อมูลไม่สำเร็จ', text: e.message }); }
    finally { busy(0); }
  }

  /* ---------- หน้าเช็คชื่อ ---------- */
  const rowHtml = (s, i) => `<tr data-sid="${esc(s.sid)}" style="animation-delay:${Math.min(i, 20) * 18}ms"><td class="c-no">${esc(s.no)}</td><td class="c-sid">${esc(s.sid)}</td><td class="c-name">${esc(fullName(s))}</td><td class="c-opts"><div class="opts">${STATUS.map(o => `<button type="button" class="opt s-${o.c} ${S.att[s.sid] === o.k ? 'on' : ''}" data-s="${o.k}">${o.k}</button>`).join('')}</div></td></tr>`;

  function renderRoster() {
    const box = $('#roster'), list = roster();
    $('#existBadge').hidden = !(ready() && S.existing);
    const show = ready() && list.length > 0;
    $('#bulk').hidden = !show; $('#savebar').hidden = !show;
    if (!ready()) { box.innerHTML = emptyHtml('เลือกรายวิชา ชั้น และคาบเรียน เพื่อเริ่มเช็คชื่อ'); return; }
    if (!list.length) { box.innerHTML = emptyHtml('ไม่พบรายชื่อนักเรียนในชั้นนี้'); return; }
    box.innerHTML = `<table class="tbl"><thead><tr><th class="c-no">เลขที่</th><th class="c-sid">รหัส</th><th>ชื่อ - นามสกุล</th><th>มา · สาย · ขาด · ลา</th></tr></thead><tbody>${list.map(rowHtml).join('')}</tbody></table>`;
    updateCounts();
  }
  function syncRows() {
    $$('#roster tbody tr').forEach(tr => {
      const st = S.att[tr.dataset.sid];
      $$('.opt', tr).forEach(b => b.classList.toggle('on', b.dataset.s === st));
    });
    updateCounts();
  }
  function updateCounts() {
    const list = roster(), c = { มา: 0, สาย: 0, ขาด: 0, ลา: 0 };
    let none = 0;
    list.forEach(s => { const st = S.att[s.sid]; if (st && c[st] !== undefined) c[st]++; else none++; });
    $('#counts').innerHTML = STATUS.map(o => `<span class="chip s-${o.c}">${o.k} <b>${c[o.k]}</b></span>`).join('') +
      `<span class="chip s-none">ยังไม่เช็ค <b>${none}</b></span>`;
  }

  async function saveAttendance(force) {
    const list = roster();
    const un = list.filter(s => !S.att[s.sid]).length;
    const records = list.filter(s => S.att[s.sid]).map(s => ({ sid: s.sid, no: s.no, first: s.first, last: s.last, status: S.att[s.sid] }));
    if (!records.length) { toast({ type: 'warn', title: 'ยังไม่ได้เช็คชื่อ', text: 'กรุณาเลือกสถานะอย่างน้อย 1 คน' }); return; }
    if (un && !force) {
      openModal(`<div class="m-confirm"><h3>ยังมี ${un} คนที่ยังไม่ได้เช็ค</h3><p>ระบบจะบันทึกเฉพาะนักเรียนที่เช็คแล้ว</p><div class="m-actions"><button class="btn ghost" data-close>กลับไปเช็คต่อ</button><button class="btn" id="mcSave">บันทึกเลย</button></div></div>`);
      $('#mcSave').onclick = () => { closeModal(); saveAttendance(true); };
      return;
    }
    const info = subjInfo(), btn = $('#btnSave'), label = $('span', btn);
    btn.disabled = true; label.innerHTML = '<span class="spinner"></span> กำลังบันทึก';
    busy(1);
    try {
      await API.saveAttendance({ date: S.date, period: S.period, subject: info.name, code: info.code, cls: S.cls, records });
      S.existing = true; $('#existBadge').hidden = false;
      toast({ type: 'success', title: 'บันทึกแล้ว', text: `${S.cls} · คาบ ${S.period} · ${records.length} คน` });
    } catch (e) {
      toast({ type: 'error', title: 'บันทึกไม่สำเร็จ', text: e.message });
    } finally { busy(0); btn.disabled = false; label.textContent = 'บันทึกการเช็คชื่อ'; }
  }

  /* ---------- หน้าสแกนบาร์โค้ด ---------- */
  const focusScan = () => { if (S.page === 'scan' && $('#modal').hidden) { const i = $('#scanInput'); if (i && !i.disabled) i.focus({ preventScroll: true }); } };
  let uid = 0, chain = Promise.resolve();
  const enqueue = fn => { chain = chain.then(fn, fn); };

  function renderScan() {
    $$('#modeSeg button').forEach(b => b.classList.toggle('on', b.dataset.mode === S.mode));
    $('#modeOpts').innerHTML = S.mode === 'attend'
      ? `<div class="mini-seg"><span>บันทึกเป็น</span><button type="button" class="s-ok ${S.scanStatus === 'มา' ? 'on' : ''}" data-ss="มา">มา</button><button type="button" class="s-late ${S.scanStatus === 'สาย' ? 'on' : ''}" data-ss="สาย">สาย</button></div>`
      : `<label class="f"><span>คะแนนต่อการสแกน</span><input type="number" id="scoreVal" step="0.5" value="${esc(S.scoreVal)}"></label><label class="f grow"><span>หัวข้อ / กิจกรรม (ไม่บังคับ)</span><input type="text" id="scoreTitle" value="${esc(S.scoreTitle)}"></label>`;
    const inp = $('#scanInput');
    inp.disabled = !ready();
    inp.placeholder = ready() ? 'สแกนบาร์โค้ดรหัสนักเรียน' : 'เลือกรายวิชา ชั้น และคาบเรียนก่อน';
    renderScanProgress();
    renderScanList();
    const r = $('#scanResult');
    if (!S.scanLog.length || !ready()) { r.className = 'scan-result idle'; r.textContent = ready() ? 'พร้อมสแกน' : 'เลือกรายวิชา ชั้น และคาบเรียน'; }
    focusScan();
  }
  function renderScanProgress() {
    const list = roster(), done = list.filter(s => S.att[s.sid]).length;
    $('#scanProg').innerHTML = ready() ? `<span>เช็คชื่อแล้ว</span><div><b>${done}</b> / ${list.length} คน</div><div class="bar"><i style="width:${list.length ? done / list.length * 100 : 0}%"></i></div>` : '';
  }
  function renderScanList() {
    const items = S.scanLog.slice(0, 14);
    $('#scanList').innerHTML = items.length ? items.map(e => {
      const t = e.time.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      const st = e.state === 'saving' ? '<span class="spinner"></span>' : e.state === 'done' ? '✓' : '✕';
      return `<li class="${e.state === 'fail' ? 'fail' : ''}"><span class="t">${t}</span><span class="n">${e.no ? esc(e.no) + '. ' : ''}${esc(e.name)}</span><span class="chip ${e.mode === 'attend' ? 's-' + cls_of(e.label) : 's-none'}">${esc(e.label)}</span><span>${st}</span></li>`;
    }).join('') : '<li class="nolist">ยังไม่มีการสแกน</li>';
  }
  function showScanResult(e) {
    const r = $('#scanResult');
    if (e.state === 'error') {
      r.className = 'scan-result is-error';
      r.innerHTML = `<div><div class="sr-no">ไม่พบรหัสนี้ในห้องนี้</div><div class="sr-name">${esc(e.name)}</div><div class="sr-state">ลองสแกนอีกครั้ง</div></div>`;
      return;
    }
    const cls = e.state === 'saving' ? 'is-saving' : e.state === 'done' ? 'is-done' : 'is-error';
    r.className = `scan-result ${cls} ${e.mode === 'score' ? 'is-score' : ''}`;
    const state = e.state === 'saving' ? '<span class="spinner"></span> กำลังบันทึก'
      : e.state === 'done' ? `<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg> บันทึกแล้ว${e.total !== undefined ? ` · คะแนนรวม ${e.total}` : ''}`
      : `บันทึกไม่สำเร็จ — ${esc(e.err || '')}`;
    r.innerHTML = `<div><div class="sr-no">เลขที่ ${esc(e.no)}</div><div class="sr-name">${esc(e.name)}</div><span class="sr-tag">${esc(e.label)}</span><div class="sr-state">${state}</div></div>`;
  }

  const findStudent = code => {
    const c = code.trim(), z = v => String(v).trim().replace(/^0+/, '');
    const list = roster();
    return list.find(s => String(s.sid).trim() === c) || list.find(s => z(s.sid) === z(c));
  };

  function handleScan(code) {
    if (!ready()) { toast({ type: 'warn', title: 'เลือกให้ครบก่อน', text: 'รายวิชา ชั้น และคาบเรียน' }); return; }
    const st = findStudent(code);
    if (!st) {
      const e = { id: ++uid, state: 'error', name: code, no: '', label: 'ไม่พบ', mode: S.mode, time: new Date() };
      showScanResult(e); beep(false);
      S.scanLog.unshift({ ...e, state: 'fail', name: code }); renderScanList();
      return;
    }
    let score = null;
    if (S.mode === 'score') {
      score = parseFloat(S.scoreVal);
      if (isNaN(score)) { toast({ type: 'warn', title: 'ใส่คะแนนก่อน', text: 'ช่องคะแนนต่อการสแกนว่างอยู่' }); return; }
    }
    const info = subjInfo();
    const e = { id: ++uid, sid: st.sid, no: st.no, name: fullName(st), mode: S.mode, state: 'saving', time: new Date(), label: S.mode === 'attend' ? S.scanStatus : `${score > 0 ? '+' : ''}${score} คะแนน` };
    const payload = {
      mode: S.mode, date: S.date, period: S.period, subject: info.name, code: info.code, cls: S.cls,
      student: { sid: st.sid, no: st.no, first: st.first, last: st.last },
      status: S.scanStatus, score, title: S.scoreTitle
    };
    S.scanLog.unshift(e); showScanResult(e); renderScanList(); beep(true);
    enqueue(async () => {
      try {
        const res = await API.scan(payload);
        e.state = 'done';
        if (payload.mode === 'attend') { S.att[st.sid] = payload.status; renderScanProgress(); } else e.total = res.total;
      } catch (err) { e.state = 'fail'; e.err = err.message; beep(false); }
      if (S.scanLog[0] === e) showScanResult(e);
      renderScanList();
    });
  }

  /* ---------- หน้าสรุป ---------- */
  async function loadSummary() {
    S.sum = null;
    renderSummary();
    if (!(S.subject && S.cls)) return;
    const tok = ++S.tok; busy(1);
    try {
      const data = await API.records({ key: S.subject, cls: S.cls });
      if (tok !== S.tok) return;
      S.sum = data; renderSummary();
    } catch (e) { toast({ type: 'error', title: 'โหลดข้อมูลไม่สำเร็จ', text: e.message }); }
    finally { busy(0); }
  }

  function computeRows() {
    const by = {};
    roster().forEach(s => { by[String(s.sid).trim()] = { s, cnt: { มา: 0, สาย: 0, ขาด: 0, ลา: 0 }, total: 0, hist: [], score: 0, scores: [] }; });
    const sessions = new Set();
    (S.sum.attendance || []).forEach(r => {
      const o = by[String(r.sid).trim()]; if (!o || o.cnt[r.status] === undefined) return;
      o.cnt[r.status]++; o.total++; o.hist.push(r); sessions.add(r.date + '|' + r.period);
    });
    (S.sum.scores || []).forEach(r => {
      const o = by[String(r.sid).trim()]; if (!o) return;
      o.score += Number(r.score) || 0; o.scores.push(r);
    });
    return { rows: Object.values(by), sessions: sessions.size };
  }

  function renderSummary() {
    const stats = $('#sumStats'), tbl = $('#sumTable');
    if (!(S.subject && S.cls)) { stats.innerHTML = ''; tbl.innerHTML = emptyHtml('เลือกรายวิชาและชั้น เพื่อดูสรุปข้อมูล'); return; }
    if (!S.sum) { stats.innerHTML = ''; tbl.innerHTML = `<div class="empty"><span class="spinner" style="font-size:2rem;color:var(--indigo)"></span><p>กำลังโหลดข้อมูล</p></div>`; return; }
    const { rows, sessions } = computeRows();
    S.rows = rows;
    const tot = rows.reduce((a, r) => a + r.total, 0), came = rows.reduce((a, r) => a + r.cnt.มา, 0);
    const hasScore = rows.some(r => r.scores.length);
    stats.innerHTML = `<div class="stat"><span>นักเรียนทั้งหมด</span><b>${rows.length} คน</b></div><div class="stat"><span>จำนวนครั้งที่เช็คชื่อ</span><b>${sessions} ครั้ง</b></div><div class="stat"><span>มาเรียนเฉลี่ยทั้งห้อง</span><b>${fmtPct(came, tot)}</b></div>`;
    if (!rows.length) { tbl.innerHTML = emptyHtml('ไม่พบรายชื่อนักเรียน'); return; }
    const bar = r => `<div class="stack" title="มา ${fmtPct(r.cnt.มา, r.total)} · สาย ${fmtPct(r.cnt.สาย, r.total)} · ขาด ${fmtPct(r.cnt.ขาด, r.total)} · ลา ${fmtPct(r.cnt.ลา, r.total)}">${STATUS.map(o => `<i class="d-${o.c}" style="width:${r.total ? r.cnt[o.k] / r.total * 100 : 0}%"></i>`).join('')}</div>`;
    const cell = (r, k, c) => `<td class="n c-${c}"><b>${r.cnt[k]}</b><small>${fmtPct(r.cnt[k], r.total)}</small></td>`;
    tbl.innerHTML = `<table class="tbl sum"><thead><tr><th class="c-no">เลขที่</th><th>ชื่อ - นามสกุล</th>${STATUS.map(o => `<th class="n"><i class="dot d-${o.c}"></i>${o.k}</th>`).join('')}<th>สัดส่วน</th><th style="text-align:right">มาเรียน</th>${hasScore ? '<th class="n">คะแนน</th>' : ''}</tr></thead><tbody>${rows.map((r, i) => `<tr data-sid="${esc(r.s.sid)}" style="animation-delay:${Math.min(i, 20) * 18}ms"><td class="c-no">${esc(r.s.no)}</td><td class="c-name">${esc(fullName(r.s))}</td>${cell(r, 'มา', 'ok')}${cell(r, 'สาย', 'late')}${cell(r, 'ขาด', 'absent')}${cell(r, 'ลา', 'leave')}<td>${bar(r)}</td><td class="pct">${fmtPct(r.cnt.มา, r.total)}</td>${hasScore ? `<td class="n"><b>${r.score}</b></td>` : ''}</tr>`).join('')}</tbody></table>`;
  }

  function openStudent(sid) {
    const r = S.rows.find(x => String(x.s.sid) === String(sid)); if (!r) return;
    const info = subjInfo();
    const hist = [...r.hist].sort((a, b) => (b.date + pad(b.period)).localeCompare(a.date + pad(a.period)));
    const tiles = STATUS.map(o => `<div class="m-tile s-${o.c}"><small>${o.k}</small><b>${r.cnt[o.k]}</b><small>${fmtPct(r.cnt[o.k], r.total)}</small></div>`).join('');
    const histHtml = hist.length ? `<table class="tbl"><thead><tr><th>วันที่</th><th>คาบ</th><th>สถานะ</th></tr></thead><tbody>${hist.map(h => `<tr><td>${esc(thShort(h.date))}</td><td>${esc(h.period)}</td><td><span class="chip s-${cls_of(h.status)}">${esc(h.status)}</span></td></tr>`).join('')}</tbody></table>` : '<p class="nolist">ยังไม่มีข้อมูลการเข้าเรียน</p>';
    const scoreHtml = r.scores.length ? `<div class="m-sec">คะแนนที่สะสม</div><div class="m-total"><span>คะแนนรวม</span><b>${r.score}</b></div><table class="tbl"><tbody>${[...r.scores].reverse().map(x => `<tr><td>${esc(thShort(x.date))} · คาบ ${esc(x.period)}</td><td>${esc(x.title || '—')}</td><td style="text-align:right"><b>${x.score > 0 ? '+' : ''}${x.score}</b></td></tr>`).join('')}</tbody></table>` : '';
    openModal(`<div class="m-head"><h3>${esc(fullName(r.s))}</h3><p>เลขที่ ${esc(r.s.no)} · รหัส ${esc(r.s.sid)} · ${esc(S.cls)} · ${esc(info ? info.name : '')}</p></div><div class="m-tiles">${tiles}</div><div class="m-total"><span>มาเรียน ${r.cnt.มา} จาก ${r.total} ครั้ง</span><b>${fmtPct(r.cnt.มา, r.total)}</b></div><div class="m-sec">ประวัติการเข้าเรียนทุกครั้ง</div>${histHtml}${scoreHtml}`);
  }

  /* ---------- Events ---------- */
  function go(page) {
    S.page = page; history.replaceState(null, '', '#' + page);
    refresh();
  }
  function bind() {
    $$('.tab').forEach(b => b.onclick = () => go(b.dataset.page));
    $('#selSubject').onchange = e => {
      S.subject = e.target.value; S.cls = '';
      fillClasses();
      const cl = classesOf(S.subject); if (cl.length === 1) { S.cls = cl[0]; $('#selClass').value = S.cls; }
      saveCtx(); refresh();
    };
    $('#selClass').onchange = e => { S.cls = e.target.value; saveCtx(); refresh(); };
    $('#inDate').onchange = e => { S.date = e.target.value || todayISO(); refresh(); };
    $('#periods').onclick = e => { const b = e.target.closest('[data-p]'); if (!b) return; S.period = +b.dataset.p; refresh(); };

    $('#roster').onclick = e => {
      const b = e.target.closest('.opt'); if (!b) return;
      const sid = b.closest('tr').dataset.sid;
      S.att[sid] = S.att[sid] === b.dataset.s ? undefined : b.dataset.s;
      if (!S.att[sid]) delete S.att[sid];
      syncRows();
    };
    $('#bulk').onclick = e => {
      const b = e.target.closest('[data-bulk]'); if (!b) return;
      roster().forEach(s => { S.att[s.sid] = b.dataset.bulk; }); syncRows();
    };
    $('#btnSave').onclick = () => saveAttendance(false);

    $('#modeSeg').onclick = e => { const b = e.target.closest('[data-mode]'); if (!b) return; S.mode = b.dataset.mode; renderScan(); };
    $('#modeOpts').onclick = e => { const b = e.target.closest('[data-ss]'); if (!b) return; S.scanStatus = b.dataset.ss; renderScan(); };
    $('#modeOpts').oninput = e => { if (e.target.id === 'scoreVal') S.scoreVal = e.target.value; if (e.target.id === 'scoreTitle') S.scoreTitle = e.target.value; };
    $('#scanInput').addEventListener('keydown', e => {
      if (e.key !== 'Enter' && e.key !== 'Tab') return;
      const v = e.target.value.trim(); if (!v) return;
      e.preventDefault(); e.target.value = ''; handleScan(v);
    });
    document.addEventListener('click', e => {
      if (S.page === 'scan' && !e.target.closest('input,select,button,textarea,.modal')) focusScan();
    });

    $('#sumTable').onclick = e => { const tr = e.target.closest('tbody tr'); if (tr) openStudent(tr.dataset.sid); };
    $('#modal').onclick = e => { if (e.target.id === 'modal' || e.target.closest('[data-close]')) closeModal(); };
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#modal').hidden) closeModal(); });

    $('#btnZoom').onclick = () => {
      const on = document.documentElement.classList.toggle('xl');
      try { localStorage.setItem('chk_xl', on ? '1' : '0'); } catch { }
    };
  }

  /* ---------- เริ่มต้น ---------- */
  async function init() {
    $('#demoBadge').hidden = !API.isDemo;
    try { if (localStorage.getItem('chk_xl') === '1') document.documentElement.classList.add('xl'); } catch { }
    $('#inDate').value = S.date;
    const h = location.hash.slice(1); if (['attend', 'scan', 'summary'].includes(h)) S.page = h;
    bind(); renderBanner(); renderPeriods(); applyPageChrome();
    $('#roster').innerHTML = emptyHtml('กำลังโหลดรายชื่อนักเรียน');
    busy(1);
    try {
      S.students = await API.students();
    } catch (e) {
      busy(0);
      $('#roster').innerHTML = emptyHtml('โหลดรายชื่อนักเรียนไม่สำเร็จ: ' + e.message, '<button class="btn" id="retry">ลองใหม่</button>');
      $('#retry').onclick = () => location.reload();
      return;
    }
    busy(0);
    try { const c = JSON.parse(localStorage.getItem('chk_ctx') || 'null'); if (c && subjects().some(x => x.key === c.subject)) { S.subject = c.subject; S.cls = c.cls; } } catch { }
    fillSubjects(); fillClasses(); refresh();
  }
  init();
})();
