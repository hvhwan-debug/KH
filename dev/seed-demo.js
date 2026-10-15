// Nạp dữ liệu mẫu để xem thử trang /asm/ trên máy chủ chạy thử (KHÔNG dùng cho production).
//   ADMIN_EMAILS=boss@livotec.vn node dev/server.js   rồi   node dev/seed-demo.js
// Sau đó mở http://localhost:7071/asm/ và đăng nhập: asm@livotec.vn / matkhau123 (hoặc boss@livotec.vn để xem quyền quản trị).
const BASE = process.env.BASE || "http://localhost:7071";
const H = { "Content-Type": "application/json", "X-Requested-With": "livotec" };
const mailbox = async () => (await fetch(BASE + "/__mailbox")).json();
function client() {
  const c = { token: "" };
  c.call = async (method, p, body) => { const r = await fetch(BASE + p, { method, headers: Object.assign({}, H, c.token ? { "X-SR-Token": c.token } : {}), body: body ? JSON.stringify(body) : undefined }); let j = {}; try { j = await r.json(); } catch (e) {} return { s: r.status, j }; };
  c.login = async (email, name) => {
    let r = await c.call("POST", "/api/auth/request", { email, password: "matkhau123", name, phone: "0901234567" });
    if (r.j.needsOtp) { const m = (await mailbox()).filter((x) => x.to === email).pop(); r = await c.call("POST", "/api/auth/request", { email, password: "matkhau123", name, phone: "0901234567", otp: (m.subject.match(/(\d{6})/) || [])[1] }); }
    c.token = r.j.token; return c;
  };
  return c;
}
let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const vn = new Date(Date.now() + 7 * 3600e3), today = vn.toISOString().slice(0, 10), month = today.slice(0, 7);
const dim = new Date(Date.UTC(+month.slice(0, 4), +month.slice(5), 0)).getUTCDate();
const days = Array.from({ length: dim }, (_, i) => month + "-" + String(i + 1).padStart(2, "0"));
const off = (d) => new Date(d + "T00:00:00Z").getUTCDay() === 0;

const SRS = [ // [email, tên, ngành, tỉnh, chỉ tiêu tháng (tr), hiệu suất, ghi chú đặc biệt]
  ["sr.minh@livotec.vn", "Nguyễn Văn Minh", 2, "Đồng Nai", 320, 1.08, ""],
  ["sr.hoa@livotec.vn", "Trần Thị Hoa", 2, "Bình Dương", 300, 0.95, ""],
  ["sr.tuan@livotec.vn", "Lê Anh Tuấn", 2, "TP. Hồ Chí Minh", 350, 0.55, "behind"],
  ["sr.lan@livotec.vn", "Phạm Ngọc Lan", 1, "Long An", 280, 1.02, ""],
  ["sr.khoa@livotec.vn", "Võ Đăng Khoa", 1, "Tiền Giang", 260, 0.78, "help"],
  ["sr.thu@livotec.vn", "Đặng Minh Thư", 1, "Cần Thơ", 300, 0.9, ""],
  ["sr.nam@livotec.vn", "Huỳnh Quốc Nam", 2, "Tây Ninh", 240, 0.85, "miss"],
  ["sr.yen@livotec.vn", "Bùi Hải Yến", 1, "Bến Tre", 270, 1.12, ""]
];
const NOTES = ["Đại lý A chờ khuyến mãi tuần sau", "Điểm bán mới ở chợ đã nhập thử 2 máy", "Khách hẹn lại thứ Năm", "Đối thủ chào giá thấp hơn 5%", "", "", "Hàng về chậm, báo khách dời lịch giao"];

(async () => {
  const admin = await client().login("boss@livotec.vn", "Quản trị Demo");
  const asm = await client().login("asm@livotec.vn", "Trần Minh Quân");
  await admin.call("POST", "/api/org", { op: "addAsm", email: "asm@livotec.vn", name: "Trần Minh Quân", area: "Miền Nam" });
  for (const [email, name, ng, prov, total, perf, tag] of SRS) {
    const c = await client().login(email, name);
    await c.call("POST", "/api/profile", { nganh: ng, asmEmail: "asm@livotec.vn", province: prov });
    const work = days.filter((d) => !off(d)), si = total / work.length, vt = Math.round(10 + total / 40);
    const labels = ng === 1 ? { bn: "Karofi", gd: "Livotec" } : { bn: "Bình nước nóng", gd: "Gia dụng" };
    const plan = { month, total, target: { bn: Math.round(total * 0.55), gd: Math.round(total * 0.45) }, pts: ng === 1 ? 90 : 120, act: 70, labels, days: {}, alerts: [] };
    days.forEach((d) => { plan.days[d] = off(d) ? { o: 1 } : { si: +si.toFixed(2), vt }; });
    const rep = {}; let ach = 0;
    days.filter((d) => d <= today && !off(d)).forEach((d, i, arr) => {
      const isToday = d === today, k = arr.length - i;
      if (tag === "miss" && k >= 1 && k <= 3) return;                    // 3 ngày gần nhất chưa gửi
      if (isToday && (tag === "behind" || rnd() < 0.3)) return;          // một phần chưa gửi hôm nay
      if (rnd() < 0.05 && !isToday) return;
      const v = Math.max(0, si * perf * (0.65 + rnd() * 0.7)), bnShare = 0.5 + rnd() * 0.2;
      ach += v;
      const e = { v: Math.round(vt * (0.7 + rnd() * 0.5)), bn: +(v * bnShare).toFixed(1), gd: +(v * (1 - bnShare)).toFixed(1), htpp: Math.round(1 + rnd() * 5), dp: Math.round(rnd() * 3), so: Math.round(v * 1.4 + rnd() * 6), note: NOTES[Math.floor(rnd() * NOTES.length)], help: tag === "help" && isToday, ng, ts: Date.now() - (arr.length - i) * 1000, sub: Date.now() - (arr.length - i) * 1000 };
      if (e.help) e.note = "Đại lý lớn nợ quá hạn, từ chối nhập thêm";
      rep[d] = e;
    });
    if (tag === "behind") plan.alerts.push({ lv: "bad", t: "Tuần kế hoạch đang chậm", x: "S.I tích lũy dưới 70% mốc cùng kỳ." });
    const r = await c.call("POST", "/api/report", { days: rep, plan });
    console.log(name.padEnd(20), "N" + ng, r.s, "báo cáo:", Object.keys(rep).length, "ngày");
  }
  console.log("\nXong. Mở " + BASE + "/asm/ — đăng nhập asm@livotec.vn / matkhau123 (ASM), boss@livotec.vn / matkhau123 (quản trị).");
})().catch((e) => { console.error(e); process.exit(1); });
