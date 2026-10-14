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

async function getProfile(uid) { return store.get("profile/" + uid + ".json"); }
async function putProfile(p) { p.updatedAt = Date.now(); await store.put("profile/" + p.uid + ".json", p); }

// Quyền của một tài khoản: quản trị viên (ADMIN_EMAILS) và/hoặc ASM (có trong danh sách ASM).
async function rolesOf(email, roster) {
  roster = roster || (await getRoster());
  const admin = isAdmin(email), asm = !!findAsm(roster, email);
  return { admin, asm, manager: admin || asm, roster };
}

async function listProfiles() {
  const keys = await store.list("profile/");
  const out = [];
  for (const k of keys) {
    let p = null;
    try { p = await store.get(k); } catch (e) { continue; }
    if (p && p.uid) out.push(p);
  }
  return out;
}

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
    days,
    alerts: (Array.isArray(p.alerts) ? p.alerts : []).slice(0, 5).map((a) => ({
      lv: ["bad", "warn", "info"].indexOf(a && a.lv) >= 0 ? a.lv : "info", t: str(a && a.t, 90), x: str(a && a.x, 240)
    }))
  };
}

module.exports = { NGANH, DATE_RE, MONTH_RE, num, str, lc, validEmail, getRoster, putRoster, findAsm, getProfile, putProfile, rolesOf, listProfiles, validDate, vnToday, addDays, cleanEntry, cleanPlan };
