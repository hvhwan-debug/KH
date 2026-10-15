// Tổ chức: ngành, hồ sơ SR, danh sách ASM, quyền xem. Dữ liệu nằm trong cùng kho Blob "livotec-sr".
//   org/roster.json        danh sách ASM do quản trị viên khai báo
//   profile/<uid>.json     hồ sơ SR: ngành, ASM phụ trách, tỉnh
//   report/<uid>.json      báo cáo cuối ngày + ảnh chụp kế hoạch của SR (ASM đọc được)
//   directive/<uid>.json   việc ASM giao cho SR
// Hồ sơ/báo cáo tách riêng khỏi user/<uid>.json để không bị ghi đè khi SR đồng bộ dữ liệu cá nhân.
const store = require("./store");
const { isAdmin, validEmail } = require("./config");

const NGANH = { 1: "Ngành 1 · Karofi & Livotec (máy lọc)", 2: "Ngành 2 · Livotec gia dụng" };
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

const num = (v, max) => { const n = Number(v); return isFinite(n) ? Math.min(max || 1e7, Math.max(0, Math.round(n * 100) / 100)) : 0; };
const str = (v, n) => String(v == null ? "" : v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim().slice(0, n);
const lc = (e) => String(e || "").trim().toLowerCase();

async function getRoster() {
  const r = await store.get("org/roster.json");
  return r && Array.isArray(r.asms) ? r : { v: 1, asms: [], updatedAt: 0 };
}
async function putRoster(r) { r.updatedAt = Date.now(); await store.put("org/roster.json", r); }
const findAsm = (roster, email) => roster.asms.find((a) => a.email === lc(email)) || null;

// Tỉnh/thành: so khớp không phân biệt hoa thường, bỏ tiền tố "Tỉnh", "TP."
const normProv = (s) => String(s || "").toLowerCase().replace(/^(tp\.?|thành phố|tỉnh)\s+/, "").replace(/\s+/g, " ").trim();
// Bản ghi ASM: phụ trách những ngành nào, những tỉnh/thành nào. Bản ghi cũ không có nganh = phụ trách cả hai ngành.
function asmRec(b, cur, email) {
  let ng = Array.isArray(b.nganh) ? b.nganh.map(Number).filter((x) => x === 1 || x === 2) : (cur && cur.nganh) || [1, 2];
  ng = ng.filter((x, i) => ng.indexOf(x) === i); if (!ng.length) ng = [1, 2];
  let pv = Array.isArray(b.provinces) ? b.provinces : typeof b.provinces === "string" ? b.provinces.split(/[,;\n]/) : (cur && cur.provinces) || [];
  pv = pv.map((x) => str(x, 60)).filter(Boolean).filter((x, i, a) => a.findIndex((y) => normProv(y) === normProv(x)) === i).slice(0, 40);
  return { email, name: str(b.name, 80), area: str(b.area != null ? b.area : (cur && cur.area), 80), nganh: ng, provinces: pv, addedAt: cur ? cur.addedAt : Date.now() };
}
const asmCovers = (a, nganh) => !a.nganh || !a.nganh.length || a.nganh.indexOf(nganh) >= 0;
async function getInvites() { const r = await store.get("org/invites.json"); return r && r.items ? r : { v: 1, items: {} }; }
async function putInvites(r) { await store.put("org/invites.json", r); }

// Nhật ký thao tác quản trị (giữ 200 dòng gần nhất): ai làm gì với ai, lúc nào. Không ghi mật khẩu hay dữ liệu cá nhân.
async function audit(by, op, target) {
  try {
    const a = (await store.get("org/audit.json")) || { items: [] };
    a.items = (a.items || []).concat([{ ts: Date.now(), by: lc(by), op: str(op, 30), target: str(target, 120) }]).slice(-200);
    await store.put("org/audit.json", a);
  } catch (e) { /* nhật ký lỗi không được chặn thao tác chính */ }
}
async function getAudit() { const a = await store.get("org/audit.json"); return (a && a.items) || []; }

async function getProfile(uid) { return store.get("profile/" + uid + ".json"); }
async function putProfile(p) { p.updatedAt = Date.now(); await store.put("profile/" + p.uid + ".json", p); await patchIndex(p.uid, p); }

// Quyền của một tài khoản: quản trị viên (ADMIN_EMAILS) và/hoặc ASM (có trong danh sách ASM).
async function rolesOf(email, roster) {
  roster = roster || (await getRoster());
  const admin = isAdmin(email), asm = !!findAsm(roster, email);
  return { admin, asm, manager: admin || asm, roster };
}

// Chạy fn trên từng phần tử với tối đa `conc` tác vụ song song (đọc blob nhanh hơn nhiều so với tuần tự).
async function pmap(items, fn, conc) {
  const out = new Array(items.length); let i = 0;
  await Promise.all(Array.from({ length: Math.min(conc || 30, items.length) }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); }
  }));
  return out;
}

// Danh sách hồ sơ: đọc từ MỘT file chỉ mục (org/pindex.json) thay vì mở từng hồ sơ; có bộ nhớ đệm 15 giây.
// Chỉ mục được cập nhật mỗi khi lưu/xoá hồ sơ và tự dựng lại từ các hồ sơ gốc sau 6 giờ (tự chữa lệch).
const PIDX = "org/pindex.json";
let _pcache = null, _pcacheAt = 0;
async function rebuildIndex() {
  const keys = await store.list("profile/");
  const items = (await pmap(keys, async (k) => { try { return await store.get(k); } catch (e) { return null; } }, 40)).filter((p) => p && p.uid);
  await store.put(PIDX, { v: 1, builtAt: Date.now(), items });
  return items;
}
async function listProfiles() {
  const now = Date.now();
  if (_pcache && now - _pcacheAt < 15000) return _pcache.slice();
  let ix = null; try { ix = await store.get(PIDX); } catch (e) {}
  const items = ix && Array.isArray(ix.items) && now - (ix.builtAt || 0) < 21600000 ? ix.items : await rebuildIndex();
  _pcache = items; _pcacheAt = now;
  return items.slice();
}
async function patchIndex(uid, p) {
  _pcache = null;
  try {
    const ix = await store.get(PIDX); if (!ix || !Array.isArray(ix.items)) return;
    const i = ix.items.findIndex((x) => x.uid === uid);
    if (p) { if (i >= 0) ix.items[i] = p; else ix.items.push(p); } else if (i >= 0) ix.items.splice(i, 1); else return;
    await store.put(PIDX, ix);
  } catch (e) {}
}
async function dropProfile(uid) { try { await store.del("profile/" + uid + ".json"); } catch (e) {} await patchIndex(uid, null); }

function validDate(d) {
  if (!DATE_RE.test(String(d))) return false;
  const t = Date.parse(d + "T00:00:00Z");
  return isFinite(t) && new Date(t).toISOString().slice(0, 10) === d;
}
// Ngày theo giờ Việt Nam (UTC+7) — máy chủ Azure chạy giờ UTC.
function vnToday(now) { return new Date((now || Date.now()) + 7 * 3600 * 1000).toISOString().slice(0, 10); }
function addDays(d, n) { return new Date(Date.parse(d + "T00:00:00Z") + n * 86400000).toISOString().slice(0, 10); }

// Báo cáo cuối ngày: 4 đầu ra ASM yêu cầu (HTPP, doanh số, độ phủ, số bán SO) + lượt ghé + ghi chú.
function cleanEntry(e, now) {
  e = e && typeof e === "object" ? e : {};
  return {
    v: num(e.v, 500),          // lượt ghé / liên hệ điểm bán
    bn: num(e.bn),             // doanh số (S.I, triệu) nhóm 1 của ngành
    gd: num(e.gd),             // doanh số (S.I, triệu) nhóm 2 của ngành
    htpp: num(e.htpp, 5000),   // HTPP
    dp: num(e.dp, 5000),       // độ phủ: số điểm bán mới được phủ trong ngày
    so: num(e.so, 100000),     // số bán SO (sell-out, đơn vị: cái)
    note: str(e.note, 400),
    help: !!e.help,            // cần ASM hỗ trợ
    ng: Number(e.ng) === 1 ? 1 : 2,
    sub: num(e.sub, 1e14) || 0,  // thời điểm SR bấm "Gửi báo cáo" (0 = nháp, chưa gửi)
    ts: Math.min(num(e.ts, 1e14) || now, now + 3600000)
  };
}

function cleanPlan(p) {
  if (!p || typeof p !== "object") return null;
  const days = {};
  Object.keys(p.days || {}).slice(0, 62).forEach((d) => {
    if (!validDate(d)) return;
    const x = p.days[d] || {};
    days[d] = x.o ? { o: 1 } : { si: num(x.si, 5000), vt: num(x.vt, 500) };
  });
  const t = p.target || {};
  return {
    month: MONTH_RE.test(String(p.month)) ? p.month : "",
    total: num(p.total),
    target: { bn: num(t.bn), gd: num(t.gd) },
    pts: num(p.pts, 100000),   // tổng số điểm bán trên tuyến (mẫu số độ phủ)
    act: num(p.act, 100000),   // số điểm bán đang hoạt động
    labels: { bn: str((p.labels || {}).bn, 40), gd: str((p.labels || {}).gd, 40) },
    // Bảng kế hoạch theo tuần của SR: kế hoạch + số thực tế SR thấy (nhập tay hoặc tự cộng từ nhật ký ngày) để ASM khớp số
    wk: (Array.isArray(p.wk) ? p.wk : []).slice(0, 8).filter((w) => w && validDate(w.f) && validDate(w.t)).map((w) => ({
      f: w.f, t: w.t,
      pl: { bn: num(w.pl && w.pl.bn), gd: num(w.pl && w.pl.gd), vt: num(w.pl && w.pl.vt, 5000) },
      ac: w.ac ? { v: num(w.ac.v, 5000), bn: num(w.ac.bn), gd: num(w.ac.gd) } : null,
      src: w.src === "daily" || w.src === "manual" ? w.src : "", ds: num(w.ds, 40), dn: num(w.dn, 40)
    })),
    days,
    alerts: (Array.isArray(p.alerts) ? p.alerts : []).slice(0, 5).map((a) => ({
      lv: ["bad", "warn", "info"].indexOf(a && a.lv) >= 0 ? a.lv : "info", t: str(a && a.t, 90), x: str(a && a.x, 240)
    }))
  };
}

module.exports = { pmap, dropProfile, audit, getAudit, normProv, asmRec, asmCovers, getInvites, putInvites, NGANH, DATE_RE, MONTH_RE, num, str, lc, validEmail, getRoster, putRoster, findAsm, getProfile, putProfile, rolesOf, listProfiles, validDate, vnToday, addDays, cleanEntry, cleanPlan };
