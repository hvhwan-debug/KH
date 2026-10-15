// Kiểm thử gán tỉnh/thành: ASM chỉ gán cho nhân sự của mình, chỉ nhận tỉnh có trong danh sách. Chạy sau dev/seed-demo.js.
const BASE = process.env.BASE || "http://localhost:7071", H = { "Content-Type": "application/json", "X-Requested-With": "livotec" };
const mailbox = async () => (await fetch(BASE + "/__mailbox")).json();
function client() { const c = { token: "" };
  c.call = async (m, p, b) => { const r = await fetch(BASE + p, { method: m, headers: Object.assign({}, H, c.token ? { "X-SR-Token": c.token } : {}), body: b ? JSON.stringify(b) : undefined }); let j = {}; try { j = await r.json(); } catch (e) {} return { s: r.status, j }; };
  c.login = async (email, name) => { let r = await c.call("POST", "/api/auth/request", { email, password: "matkhau123", name });
    if (r.j.needsOtp) { const m = (await mailbox()).filter((x) => x.to === email).pop(); r = await c.call("POST", "/api/auth/request", { email, password: "matkhau123", name, otp: (m.subject.match(/(\d{6})/) || [])[1] }); }
    c.token = r.j.token; return c; }; return c; }
// Danh sách tỉnh trong máy chủ, trang ASM và app nhân viên phải giống hệt nhau
(function syncCheck() {
  const fs = require("fs"), path = require("path"), P = require("../api/_lib/provinces").PROVINCES;
  const grab = (f) => { const s = fs.readFileSync(path.join(__dirname, "..", f), "utf8"), i = s.indexOf("PROVINCES=["), j = s.indexOf("];", i); return (s.slice(i, j).match(/'([^']+)'|"([^"]+)"/g) || []).map((x) => x.slice(1, -1)); };
  const a = grab("asm/index.html"), b = grab("index.html"), same = (x, y) => x.length === y.length && x.every((v, k) => v === y[k]);
  console.log((same(P, a) ? "PASS " : "FAIL ") + "danh sách tỉnh trang ASM khớp máy chủ (" + a.length + ")");
  console.log((same([...P].sort(), [...b].sort()) ? "PASS " : "FAIL ") + "danh sách tỉnh app nhân viên khớp máy chủ (" + b.length + ")");
})();
(async () => {
  const ok = (n, c) => console.log((c ? "PASS " : "FAIL ") + n);
  const admin = await client().login("boss@livotec.vn", "Admin"), asm = await client().login("asm@livotec.vn", "ASM"), asm2 = await client().login("asm2@livotec.vn", "ASM2");
  await admin.call("POST", "/api/org", { op: "addAsm", email: "asm2@livotec.vn", name: "ASM Hai", nganh: [1, 2] });
  const t = await asm.call("GET", "/api/team"), mine = t.j.members.map((m) => m.uid);
  let r = await asm.call("POST", "/api/team", { op: "setProvince", uid: mine[0], province: "Đắk Nông" });
  ok("ASM gán tỉnh cho nhân sự của mình (" + r.s + ", cập nhật " + r.j.updated + ")", r.s === 200 && r.j.updated === 1 && r.j.province === "Đắk Nông");
  r = await asm.call("POST", "/api/team", { op: "setProvince", uid: mine[1], province: "tp hcm" });
  ok("tên viết tắt được chuẩn hoá: 'tp hcm' → " + r.j.province, r.s === 200 && r.j.province === "Thành phố Hồ Chí Minh");
  r = await asm.call("POST", "/api/team", { op: "setProvince", uid: mine[2], province: "Dak Nong" });
  ok("không dấu vẫn nhận: 'Dak Nong' → " + r.j.province, r.s === 200 && r.j.province === "Đắk Nông");
  const t2 = await asm.call("GET", "/api/team"); const m0 = t2.j.members.find((m) => m.uid === mine[0]);
  ok("tỉnh được lưu vào hồ sơ (" + m0.province + ")", m0.province === "Đắk Nông");
  r = await asm.call("POST", "/api/team", { op: "setProvince", uid: mine[0], province: "Tỉnh Không Có" }); ok("tỉnh ngoài danh sách bị từ chối (" + r.s + ")", r.s === 400);
  r = await asm.call("POST", "/api/team", { op: "setProvince", uids: mine.slice(3, 6), province: "Long An" });
  ok("gán một tỉnh cho 3 người cùng lúc (" + r.j.updated + ")", r.s === 200 && r.j.updated === 3);
  r = await asm2.call("POST", "/api/team", { op: "setProvince", uid: mine[0], province: "Cần Thơ" }); ok("ASM khác không gán được cho nhân sự không thuộc nhóm (" + r.s + ")", r.s === 403);
  const t3 = await asm.call("GET", "/api/team"); ok("giá trị cũ không bị ASM khác ghi đè", t3.j.members.find((m) => m.uid === mine[0]).province === "Đắk Nông");
  r = await asm.call("POST", "/api/team", { op: "setProvince", uids: [mine[0], "0123456789abcdef0123456789abcdef"], province: "Cà Mau" }); ok("uid lạ bị bỏ qua, chỉ cập nhật 1 người (" + r.j.updated + ", bỏ qua " + r.j.skipped + ")", r.s === 200 && r.j.updated === 1 && r.j.skipped === 1);
  r = await asm.call("POST", "/api/team", { op: "setProvince", uid: mine[0], province: "" }); ok("xoá tỉnh bằng giá trị trống", r.s === 200 && r.j.province === "");
  r = await asm.call("POST", "/api/org", { op: "invite", email: "x@livotec.vn", nganh: 1, province: "Abc" }); ok("ASM không dùng được /api/org (" + r.s + ")", r.s === 403);
  r = await admin.call("POST", "/api/org", { op: "invite", email: "moi@livotec.vn", nganh: 1, province: "Abc" }); ok("admin: tạo trước với tỉnh lạ bị từ chối (" + r.s + ")", r.s === 400);
  r = await admin.call("POST", "/api/org", { op: "invite", email: "moi@livotec.vn", nganh: 1, province: "TP. Hồ Chí Minh" }); ok("admin: tạo trước với 'TP. Hồ Chí Minh' được chuẩn hoá", r.s === 200);
  r = await admin.call("POST", "/api/org", { op: "addAsm", email: "asm9@livotec.vn", name: "ASM Chín", nganh: [1], provinces: ["Đắk Nông", "Abc"] }); ok("admin: ASM với tỉnh lạ bị từ chối (" + r.s + ")", r.s === 400);
  r = await admin.call("POST", "/api/org", { op: "addAsm", email: "asm9@livotec.vn", name: "ASM Chín", nganh: [1], provinces: ["dak nong", "Tiền Giang", "tiền giang"] });
  const o = await admin.call("GET", "/api/org"); const a9 = o.j.asms.find((x) => x.email === "asm9@livotec.vn");
  ok("admin: tỉnh của ASM được chuẩn hoá và bỏ trùng → " + JSON.stringify(a9 && a9.provinces), a9 && a9.provinces.join("|") === "Đắk Nông|Tiền Giang");
  r = await admin.call("POST", "/api/org", { op: "createMember", role: "sr", email: "sr.t@livotec.vn", name: "SR T", nganh: 1, province: "xyz" }); ok("admin: tạo SR với tỉnh lạ bị từ chối (" + r.s + ")", r.s === 400);
})();
