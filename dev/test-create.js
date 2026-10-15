// Kiểm thử: quản trị viên tạo thành viên (ASM / SR). Chạy sau dev/server.js + dev/seed-demo.js.
const BASE = process.env.BASE || "http://localhost:7071", H = { "Content-Type": "application/json", "X-Requested-With": "livotec" };
const mailbox = async () => (await fetch(BASE + "/__mailbox")).json();
function client() { const c = { token: "" };
  c.call = async (m, p, b) => { const r = await fetch(BASE + p, { method: m, headers: Object.assign({}, H, c.token ? { "X-SR-Token": c.token } : {}), body: b ? JSON.stringify(b) : undefined }); let j = {}; try { j = await r.json(); } catch (e) {} return { s: r.status, j }; };
  c.login = async (email, pass, name) => { let r = await c.call("POST", "/api/auth/request", { email, password: pass, name, phone: "0901234567" });
    if (r.j.needsOtp) { const m = (await mailbox()).filter((x) => x.to === email).pop(); r = await c.call("POST", "/api/auth/request", { email, password: pass, name, phone: "0901234567", otp: (m.subject.match(/(\d{6})/) || [])[1] }); }
    c.token = r.j.token; return c; }; return c; }
(async () => {
  const ok = (n, c) => console.log((c ? "PASS " : "FAIL ") + n);
  const admin = await client().login("boss@livotec.vn", "matkhau123", "Admin");
  const asm = await client().login("asm@livotec.vn", "matkhau123", "ASM");
  // 1) tạo ASM mới (mật khẩu tự sinh)
  const a = await admin.call("POST", "/api/org", { op: "createMember", role: "asm", email: "asm3@livotec.vn", name: "ASM Ba", nganhs: [1], provinces: "Đắk Nông, Đắk Lắk" });
  ok("tạo ASM, có mật khẩu tạm (" + (a.j.tempPassword || "").length + " ký tự)", a.s === 200 && a.j.created && a.j.tempPassword.length === 10);
  const asm3 = await client().login("asm3@livotec.vn", a.j.tempPassword, "");
  const t3 = await asm3.call("GET", "/api/team");
  ok("ASM mới đăng nhập được bằng mật khẩu tạm và vào được trang quản lý (" + t3.s + ")", t3.s === 200);
  const org = await admin.call("GET", "/api/org");
  const rec = org.j.asms.find((x) => x.email === "asm3@livotec.vn");
  ok("ASM mới có ngành [1] và 2 tỉnh", rec && rec.nganh.length === 1 && rec.provinces.length === 2);
  // 2) tạo SR gán cho ASM mới, đặt mật khẩu riêng
  const s1 = await admin.call("POST", "/api/org", { op: "createMember", role: "sr", email: "sr.moi@livotec.vn", name: "Nguyễn SR Mới", nganh: 1, asmEmail: "asm3@livotec.vn", province: "Đắk Nông", password: "MatKhauTam123" });
  ok("tạo SR với mật khẩu tự đặt, không trả lại mật khẩu (" + JSON.stringify(s1.j.tempPassword) + ")", s1.s === 200 && s1.j.created && s1.j.tempPassword === "");
  const t3b = await asm3.call("GET", "/api/team");
  ok("SR mới nằm trong nhóm của ASM mới", t3b.j.members.some((m) => m.email === "sr.moi@livotec.vn" && m.nganh === 1 && m.province === "Đắk Nông"));
  const t1 = await asm.call("GET", "/api/team");
  ok("ASM khác không thấy SR mới", !t1.j.members.some((m) => m.email === "sr.moi@livotec.vn"));
  const sr = await client().login("sr.moi@livotec.vn", "MatKhauTam123", "");
  const me = await sr.call("GET", "/api/auth/me"); ok("SR mới đăng nhập được, không cần OTP (" + me.s + ")", me.j.loggedIn === true);
  // 3) phân quyền & kiểm tra đầu vào
  const bad1 = await asm.call("POST", "/api/org", { op: "createMember", role: "sr", email: "x@livotec.vn", name: "X", nganh: 1 }); ok("ASM không tạo được thành viên (" + bad1.s + ")", bad1.s === 403);
  const bad2 = await admin.call("POST", "/api/org", { op: "createMember", role: "sr", email: "khong-hop-le", name: "X", nganh: 1 }); ok("email sai bị từ chối (" + bad2.s + ")", bad2.s === 400);
  const bad3 = await admin.call("POST", "/api/org", { op: "createMember", role: "sr", email: "y@livotec.vn", name: "Y" }); ok("SR thiếu ngành bị từ chối (" + bad3.s + ")", bad3.s === 400);
  const bad4 = await admin.call("POST", "/api/org", { op: "createMember", role: "sr", email: "z@livotec.vn", name: "Z", nganh: 1, password: "123" }); ok("mật khẩu quá ngắn bị từ chối (" + bad4.s + ")", bad4.s === 400);
  const bad5 = await admin.call("POST", "/api/org", { op: "createMember", role: "sr", email: "w@livotec.vn", name: "W", nganh: 1, asmEmail: "khong.co@livotec.vn" }); ok("ASM không có trong danh sách bị từ chối (" + bad5.s + ")", bad5.s === 400);
  // 4) đổi vai trò người đã có tài khoản: SR → ASM
  const up = await admin.call("POST", "/api/org", { op: "createMember", role: "asm", email: "sr.moi@livotec.vn", name: "Nguyễn SR Mới", nganhs: [1, 2] });
  ok("đổi SR thành ASM, không tạo lại tài khoản (created=" + up.j.created + ")", up.s === 200 && up.j.created === false);
  const org2 = await admin.call("GET", "/api/org");
  ok("sau khi đổi: có trong danh sách ASM, không còn là SR", org2.j.asms.some((x) => x.email === "sr.moi@livotec.vn") && !org2.j.profiles.some((p) => p.email === "sr.moi@livotec.vn"));
  ok("nhật ký ghi thao tác tạo/gán", org2.j.audit.some((x) => /Tạo thành viên/.test(x.op || x.a || JSON.stringify(x))));
})();
