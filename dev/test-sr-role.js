// Kiểm thử: nhân sự (SR) đã có ASM thì không tự đổi ngành/ASM; chưa có ASM thì được chọn một lần. Chạy sau dev/seed-demo.js.
const BASE = process.env.BASE || "http://localhost:7071", H = { "Content-Type": "application/json", "X-Requested-With": "livotec" };
const mailbox = async () => (await fetch(BASE + "/__mailbox")).json();
function client() { const c = { token: "" };
  c.call = async (m, p, b) => { const r = await fetch(BASE + p, { method: m, headers: Object.assign({}, H, c.token ? { "X-SR-Token": c.token } : {}), body: b ? JSON.stringify(b) : undefined }); let j = {}; try { j = await r.json(); } catch (e) {} return { s: r.status, j }; };
  c.login = async (email, name, pass) => { let r = await c.call("POST", "/api/auth/request", { email, password: pass || "matkhau123", name, phone: "0901234567" });
    if (r.j.needsOtp) { const m = (await mailbox()).filter((x) => x.to === email).pop(); r = await c.call("POST", "/api/auth/request", { email, password: pass || "matkhau123", name, phone: "0901234567", otp: (m.subject.match(/(\d{6})/) || [])[1] }); }
    c.token = r.j.token; return c; }; return c; }
(async () => {
  const ok = (n, c) => console.log((c ? "PASS " : "FAIL ") + n);
  const admin = await client().login("boss@livotec.vn", "Admin"), asm = await client().login("asm@livotec.vn", "ASM");
  await admin.call("POST", "/api/org", { op: "addAsm", email: "asm2@livotec.vn", name: "ASM Hai", nganh: [1, 2] });
  // SR do quản trị viên tạo, đã gán ASM
  await admin.call("POST", "/api/org", { op: "createMember", role: "sr", email: "sr.a@livotec.vn", name: "SR A", nganh: 1, asmEmail: "asm@livotec.vn", password: "matkhau123" });
  const sr = await client().login("sr.a@livotec.vn", "");
  let r = await sr.call("POST", "/api/profile", { nganh: 2, asmEmail: "asm2@livotec.vn", province: "Cà Mau" });
  ok("SR đã có ASM: đổi ngành + ASM không được (ghi chú: " + (r.j.note ? "có" : "không") + ")", r.s === 200 && r.j.profile.nganh === 1 && r.j.profile.asmEmail === "asm@livotec.vn" && !!r.j.note);
  ok("…nhưng vẫn lưu được tỉnh của chính mình (" + r.j.profile.province + ")", r.j.profile.province === "Cà Mau");
  r = await sr.call("POST", "/api/profile", { nganh: 1, asmEmail: "", province: "Cà Mau" });
  ok("SR không tự gỡ ASM được", r.j.profile.asmEmail === "asm@livotec.vn");
  r = await sr.call("POST", "/api/profile", { nganh: 1, asmEmail: "asm@livotec.vn", province: "Cà Mau" });
  ok("gửi lại đúng giá trị hiện tại: không có ghi chú lỗi", r.s === 200 && !r.j.note);
  // SR tự đăng ký, chưa có ASM: được chọn một lần
  const sr2 = await client().login("sr.b@livotec.vn", "SR B");
  r = await sr2.call("POST", "/api/profile", { nganh: 2, asmEmail: "asm2@livotec.vn", province: "" });
  ok("SR chưa có ASM: tự chọn lần đầu được", r.s === 200 && r.j.profile.nganh === 2 && r.j.profile.asmEmail === "asm2@livotec.vn");
  r = await sr2.call("POST", "/api/profile", { nganh: 1, asmEmail: "asm@livotec.vn", province: "" });
  ok("…rồi không tự đổi sang ASM/ngành khác được", r.j.profile.nganh === 2 && r.j.profile.asmEmail === "asm2@livotec.vn" && !!r.j.note);
  // ASM gỡ khỏi nhóm → SR chọn lại được, nhưng không chọn lại ASM đã gỡ
  const asm2 = await client().login("asm2@livotec.vn", "ASM Hai"), t = await asm2.call("GET", "/api/team"), m = t.j.members.find((x) => x.email === "sr.b@livotec.vn");
  r = await asm2.call("POST", "/api/team", { op: "removeMember", uid: m.uid }); ok("ASM gỡ SR khỏi nhóm (" + r.s + ")", r.s === 200);
  r = await sr2.call("POST", "/api/profile", { nganh: 2, asmEmail: "asm2@livotec.vn", province: "" }); ok("SR không chọn lại ASM đã gỡ mình (" + r.s + ")", r.s === 400);
  r = await sr2.call("POST", "/api/profile", { nganh: 1, asmEmail: "asm@livotec.vn", province: "" }); ok("SR chọn ASM khác được sau khi bị gỡ", r.s === 200 && r.j.profile.asmEmail === "asm@livotec.vn");
  // quản trị viên và ASM không bị giới hạn
  r = await admin.call("POST", "/api/org", { op: "assign", uid: m.uid, asmEmail: "asm2@livotec.vn", lock: true }); ok("quản trị viên vẫn đổi ASM cho SR (" + r.s + ")", r.s === 200);
  r = await asm.call("POST", "/api/profile", { nganh: 2, asmEmail: "", province: "" }); ok("tài khoản ASM tự đổi ngành hồ sơ của mình được (" + r.s + ")", r.s === 200 && r.j.profile.nganh === 2);
})();
