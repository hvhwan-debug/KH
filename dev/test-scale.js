// Đo tải với số lượng lớn nhân sự (chạy ngay trong tiến trình, kho dữ liệu bộ nhớ). Mặc định 10.001 nhân sự, 300 ASM.
//   node dev/test-scale.js [soNhanSu] [soASM]
const N = +process.argv[2] || 10001, NA = +process.argv[3] || 300;
Object.assign(process.env, { STORAGE_MODE: "memory", MAIL_MODE: "memory", COOKIE_INSECURE: "1", SESSION_SECRET: "dev-session-secret-dev-session-secret-1234", CRON_SECRET: "dev-cron-secret-1234567890", ALLOWED_EMAIL_DOMAINS: "livotec.vn", APP_URL: "http://localhost:7071", ADMIN_EMAILS: "boss@livotec.vn" });
const store = require("../api/_lib/store"), org = require("../api/_lib/org"), session = require("../api/_lib/session");
let gets = 0; const rawGet = store.get; store.get = async (k) => { gets++; return rawGet(k); };
const team = require("../api/team/index.js"), directive = require("../api/directive/index.js");
const month = org.vnToday().slice(0, 7), days = {}; for (let d = 1; d <= 12; d++) days[month + "-" + String(d).padStart(2, "0")] = { sub: 1, bn: 5, gd: 3, v: 8, htpp: 2, dp: 1, so: 3 };
const plan = { month, total: 300, target: { bn: 160, gd: 140 }, pts: 90, act: 20, labels: { bn: "Karofi", gd: "Livotec" }, days: {}, wk: [], alerts: [] };
Object.keys(days).forEach((d) => { plan.days[d] = { si: 12, vt: 8 }; });
const call = async (h, email, q, method, body) => { const ctx = { log: Object.assign(() => {}, { error: console.error }), res: null }; const tok = session.sign({ uid: session.uidOf(email), email, exp: Date.now() + 36e5 * 24 });
  gets = 0; const t = Date.now(); await h(ctx, { method: method || "GET", headers: { "x-sr-token": tok, "x-requested-with": "livotec" }, query: q || {}, body }); return { ms: Date.now() - t, gets, s: ctx.res.status, j: ctx.res.body }; };
(async () => {
  const asms = []; for (let i = 0; i < NA; i++) asms.push({ email: "asm" + i + "@livotec.vn", name: "ASM " + i, nganh: [1, 2], provinces: [], addedAt: 1 });
  await org.putRoster({ v: 1, asms });
  const wr = rawGet; for (let i = 0; i < N; i++) { const email = "sr" + i + "@livotec.vn", uid = session.uidOf(email);
    await store.put("user/" + uid + ".json", { uid, email, name: "Nhân sự " + i, verified: true });
    await store.put("profile/" + uid + ".json", { uid, email, name: "Nhân sự " + i, nganh: 1 + (i % 2), asmEmail: asms[i % NA].email, province: "Tỉnh " + (i % 63), locked: true, createdAt: 1 });
    await store.put("report/" + uid + ".json", { name: "Nhân sự " + i, days, plan, updatedAt: Date.now() }); }
  for (const e of ["boss@livotec.vn", "asm0@livotec.vn"]) { const u = session.uidOf(e); await store.put("user/" + u + ".json", { uid: u, email: e, name: e, verified: true }); }
  console.log("Dữ liệu giả lập: " + N + " nhân sự, " + NA + " ASM\n");
  let r = await call(team, "boss@livotec.vn", { month });
  console.log("Quản trị xem 'Tất cả ASM'  : " + r.ms + " ms, " + r.gets + " lần đọc blob, trả " + (r.j.members || []).length + " nhân sự (tổng " + (r.j.total || "?") + "), ~" + Math.round(JSON.stringify(r.j).length / 1024) + " KB");
  r = await call(team, "asm0@livotec.vn", { month });
  console.log("ASM xem nhóm của mình      : " + r.ms + " ms, " + r.gets + " lần đọc blob, " + (r.j.members || []).length + " nhân sự");
  r = await call(team, "boss@livotec.vn", { month, q: "Nhân sự 777" });
  console.log("Quản trị tìm 'Nhân sự 777' : " + r.ms + " ms, " + r.gets + " lần đọc blob, " + (r.j.members || []).length + " kết quả");
  r = await call(directive, "boss@livotec.vn", {}, "POST", { op: "send", to: "all", text: "thử giao cả hệ thống", kind: "note" });
  console.log("Quản trị 'giao cả nhóm'    : " + r.ms + " ms, " + r.gets + " lần đọc blob, mã " + r.s + (r.j && r.j.error ? " — " + r.j.error : " — gửi " + r.j.sent + " người"));
  if (r.j && r.j.ok === undefined) {} 
})();
