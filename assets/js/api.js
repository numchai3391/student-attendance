/* เชื่อมต่อ Google Apps Script (หรือโหมดตัวอย่างเมื่อยังไม่ได้ตั้งค่า API_URL) */
const API = (() => {
  const cfg = window.APP_CONFIG;
  const isDemo = !cfg.API_URL;

  /* ---------- ของจริง ---------- */
  async function parse(res) {
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'เกิดข้อผิดพลาด');
    return data;
  }
  async function get(action, params = {}) {
    const url = new URL(cfg.API_URL);
    url.searchParams.set('action', action);
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    return parse(await fetch(url.toString()));
  }
  async function post(action, payload) {
    // ใช้ text/plain เพื่อไม่ให้เบราว์เซอร์ส่ง preflight (Apps Script ไม่รองรับ OPTIONS)
    return parse(await fetch(cfg.API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, ...payload })
    }));
  }

  /* ---------- โหมดตัวอย่าง (เก็บในเครื่อง) ---------- */
  const LS = 'chk_demo_v1';
  let db = null;
  const delay = (ms = 350) => new Promise(r => setTimeout(r, ms));
  const persist = () => localStorage.setItem(LS, JSON.stringify(db));

  function seed() {
    const first = ['สมชาย', 'สมหญิง', 'ธนากร', 'ปวีณา', 'กิตติพงษ์', 'อรทัย', 'วีรภัทร', 'ณัฐธิดา', 'พิชญะ', 'กชกร', 'ภูริทัต', 'ชนิกานต์'];
    const last = ['ใจดี', 'รักเรียน', 'แสงทอง', 'มีสุข', 'พรหมมา', 'ศรีสวัสดิ์', 'ทองคำ', 'บุญเรือง', 'คำแก้ว', 'วงศ์ใหญ่', 'สุขสันต์', 'อินทร์แก้ว'];
    const groups = [
      ['สังคมศึกษา ศาสนา และวัฒนธรรม 1', 'ส22101', 'ม.2/1', 201],
      ['สังคมศึกษา ศาสนา และวัฒนธรรม 1', 'ส22101', 'ม.2/2', 202],
      ['ประวัติศาสตร์ 1', 'ส22103', 'ม.2/1', 201]
    ];
    const students = [];
    groups.forEach(([subject, code, cls, base]) => {
      for (let i = 0; i < 12; i++) {
        students.push({ subject, code, cls, no: String(i + 1), sid: `${base}${String(i + 1).padStart(2, '0')}`, first: first[(i + base) % 12], last: last[(i * 5 + base) % 12] });
      }
    });
    let seedN = 7;
    const rnd = () => (seedN = (seedN * 9301 + 49297) % 233280) / 233280;
    const attendance = [];
    const dates = ['2026-10-19', '2026-10-21', '2026-10-26', '2026-10-28'];
    students.forEach(s => dates.forEach((date, di) => {
      const r = rnd();
      attendance.push({ date, period: String(2 + (di % 2)), key: s.code, cls: s.cls, sid: s.sid, status: r < .74 ? 'มา' : r < .85 ? 'สาย' : r < .93 ? 'ขาด' : 'ลา' });
    }));
    return { students, attendance, scores: [] };
  }
  function ensureDb() {
    if (db) return;
    try { db = JSON.parse(localStorage.getItem(LS)); } catch { db = null; }
    if (!db) { db = seed(); persist(); }
  }
  function upsert(rec) {
    const i = db.attendance.findIndex(a => a.date === rec.date && a.period === rec.period && a.key === rec.key && a.cls === rec.cls && a.sid === rec.sid);
    if (i > -1) db.attendance[i] = rec; else db.attendance.push(rec);
  }

  const demo = {
    async students() { await delay(); ensureDb(); return db.students; },
    async session({ date, period, key, cls }) {
      await delay(250); ensureDb();
      return db.attendance.filter(a => a.date === date && a.period === String(period) && a.key === key && a.cls === cls).map(a => ({ sid: a.sid, status: a.status }));
    },
    async records({ key, cls }) {
      await delay(); ensureDb();
      return {
        attendance: db.attendance.filter(a => a.key === key && a.cls === cls),
        scores: db.scores.filter(a => a.key === key && a.cls === cls)
      };
    },
    async saveAttendance(b) {
      await delay(500); ensureDb();
      b.records.forEach(r => upsert({ date: b.date, period: String(b.period), key: b.code || b.subject, cls: b.cls, sid: r.sid, status: r.status }));
      persist(); return { saved: b.records.length };
    },
    async scan(b) {
      await delay(300); ensureDb();
      const key = b.code || b.subject;
      if (b.mode === 'score') {
        db.scores.push({ date: b.date, period: String(b.period), key, cls: b.cls, sid: b.student.sid, score: Number(b.score), title: b.title || '' });
        persist();
        return { total: db.scores.filter(s => s.key === key && s.cls === b.cls && s.sid === b.student.sid).reduce((t, s) => t + s.score, 0) };
      }
      upsert({ date: b.date, period: String(b.period), key, cls: b.cls, sid: b.student.sid, status: b.status });
      persist(); return {};
    }
  };

  /* ---------- ส่วนที่แอปเรียกใช้ ---------- */
  return {
    isDemo,
    students: async () => isDemo ? demo.students() : (await get('students')).students,
    session: async (p) => isDemo ? demo.session(p) : (await get('session', p)).records,
    records: async (p) => isDemo ? demo.records(p) : get('records', p),
    saveAttendance: (b) => isDemo ? demo.saveAttendance(b) : post('saveAttendance', b),
    scan: (b) => isDemo ? demo.scan(b) : post('scan', b)
  };
})();
