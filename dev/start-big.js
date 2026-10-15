// Chạy máy chủ thử với SỐ LƯỢNG LỚN nhân sự để xem giao diện. Dùng:  node dev/start-big.js [soNhanSu] [soASM]
// Đăng nhập: boss@livotec.vn / matkhau123 (quản trị), asm0@livotec.vn / matkhau123 (ASM của nhóm đầu tiên)
const N = +process.argv[2] || 10001, NA = +process.argv[3] || 300;
process.env.ADMIN_EMAILS = process.env.ADMIN_EMAILS || "boss@livotec.vn";
require("./server.js"); // dùng chung bộ nhớ với các hàm API trong cùng tiến trình
const store = require("../api/_lib/store"), org = require("../api/_lib/org"), session = require("../api/_lib/session"), pwd = require("../api/_lib/pwd");
(async () => {
  const month = org.vnToday().slice(0, 7), today = org.vnToday(), days = {}, planDays = {};
  const wd = []; for (let d = 1; d <= 31; d++) { const k = month + "-" + String(d).padStart(2, "0"); if (new Date(k + "T00:00:00Z").getUTCMonth() + 1 === +month.slice(5) && new Date(k + "T00:00:00Z").getUTCDay() !== 0) wd.push(k); }
  wd.forEach((k) => { planDays[k] = { si: 12, vt: 8 }; });
  const asms = []; for (let i = 0; i < NA; i++) asms.push({ email: "asm" + i + "@livotec.vn", name: "ASM " + String(i).padStart(3, "0"), nganh: [1, 2], provinces: [], addedAt: 1 });
  await org.putRoster({ v: 1, asms });
  const mk = async (email, name) => { const uid = session.uidOf(email); await store.put("user/" + uid + ".json", { v: 1, uid, email, name, rev: 0, state: null, digest: null, prefs: {}, sent: {}, pwd: pwd.hash("matkhau123"), verified: true }); return uid; };
  await mk("boss@livotec.vn", "Quản trị Demo"); await mk("asm0@livotec.vn", "ASM 000");
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < N; i++) {
    const email = "sr" + i + "@livotec.vn", uid = session.uidOf(email), name = "Nhân sự " + String(i).padStart(5, "0"), perf = 0.5 + rnd();
    const dd = {}; wd.filter((k) => k <= today).forEach((k) => { if (rnd() < 0.9) dd[k] = { sub: Date.now(), bn: +(7 * perf).toFixed(1), gd: +(5 * perf).toFixed(1), v: 8, htpp: 2, dp: 1, so: 3 }; });
    await store.put("user/" + uid + ".json", { uid, email, name, verified: true });
    await org.putProfile({ uid, email, name, nganh: 1 + (i % 2), asmEmail: asms[i % NA].email, province: "Tỉnh " + (i % 63), locked: true, createdAt: 1 });
    await store.put("report/" + uid + ".json", { name, days: dd, plan: { month, total: 300, target: { bn: 160, gd: 140 }, pts: 90, act: 20, labels: { bn: "Karofi", gd: "Livotec" }, days: planDays, wk: [], alerts: [] }, updatedAt: Date.now() });
  }
  console.log("Sẵn sàng: " + N + " nhân sự, " + NA + " ASM tại http://localhost:" + (process.env.PORT || 7071) + "/asm/index.html");
})();
