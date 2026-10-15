// Kiểm thử đăng ký bắt buộc họ tên + số điện thoại. Chạy với dev/server.js (ADMIN_EMAILS=boss@livotec.vn) vừa khởi động.
const BASE = process.env.BASE || "http://localhost:7071", H = { "Content-Type": "application/json", "X-Requested-With": "livotec" };
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? "PASS " : "FAIL ") + m); };
const call = async (m, p, b, tok) => { const r = await fetch(BASE + p, { method: m, headers: Object.assign({}, H, tok ? { "X-SR-Token": tok } : {}), body: b ? JSON.stringify(b) : undefined }); let j = {}; try { j = await r.json(); } catch (e) {} return { s: r.status, j }; };
const mailbox = async () => (await fetch(BASE + "/__mailbox")).json();
const reg = (email, extra) => call("POST", "/api/auth/request", Object.assign({ email, password: "matkhau123" }, extra));
const finish = async (email, extra) => { let r = await reg(email, extra); if (r.j.needsOtp) { const m = (await mailbox()).filter((x) => x.to === email).pop(); r = await reg(email, Object.assign({}, extra, { otp: (m.subject.match(/(\d{6})/) || [])[1] })); } return r; };
(async () => {
  let r = await reg("a1@livotec.vn", {});
  ok(r.s === 400 && /Đăng ký/.test(r.j.error), "không tên, không SĐT (đăng nhập email chưa có tk) -> 400 hướng dẫn chọn Đăng ký");
  r = await reg("a2@livotec.vn", { name: "Nguyễn Văn A" });
  ok(r.s === 400 && r.j.field === "phone", "có tên, thiếu SĐT -> 400 field=phone");
  r = await reg("a3@livotec.vn", { phone: "0901234567" });
  ok(r.s === 400 && r.j.field === "name", "có SĐT, thiếu tên -> 400 field=name");
  r = await reg("a4@livotec.vn", { name: "A", phone: "0901234567" });
  ok(r.s === 400 && r.j.field === "name", "tên quá ngắn -> 400");
  for (const bad of ["0123", "abc", "1901234567", "09012345678", "0112345678"]) {
    r = await reg("a5@livotec.vn", { name: "Nguyễn Văn A", phone: bad });
    ok(r.s === 400 && r.j.field === "phone", "SĐT sai '" + bad + "' bị từ chối");
  }
  const fmts = ["0901234567", "+84 901 234 567", "84901234567", "090.123.4567", "090-123-4567"];
  for (let i = 0; i < fmts.length; i++) {
    const email = "ok" + i + "@livotec.vn";
    r = await finish(email, { name: "Trần Thị B", phone: fmts[i] });
    ok(r.s === 200 && r.j.token, "đăng ký thành công với SĐT '" + fmts[i] + "'");
  }
  // SĐT được chuẩn hoá và lưu vào hồ sơ; ASM thấy
  const admin = await finish("boss@livotec.vn", { name: "Quản trị", phone: "0912345678" });
  await call("POST", "/api/org", { op: "addAsm", email: "asm@livotec.vn", name: "ASM T", area: "x" }, admin.j.token);
  const sr = await finish("sr.reg@livotec.vn", { name: "SR Đăng Ký", phone: "+84 988 777 666" });
  await call("POST", "/api/profile", { nganh: 2, asmEmail: "asm@livotec.vn", province: "Đồng Nai" }, sr.j.token);
  const asm = await finish("asm@livotec.vn", { name: "ASM T", phone: "0909090909" });
  const t = await call("GET", "/api/team", null, asm.j.token);
  const m = ((t.j && t.j.members) || []).find((x) => x.email === "sr.reg@livotec.vn");
  ok(m && m.phone === "0988777666", "ASM thấy SĐT đã chuẩn hoá của SR (" + (m && m.phone) + ")");
  // Đăng nhập tài khoản cũ không cần SĐT
  r = await call("POST", "/api/auth/request", { email: "sr.reg@livotec.vn", password: "matkhau123" });
  ok(r.s === 200 && r.j.token, "đăng nhập tài khoản đã có không yêu cầu họ tên/SĐT");
  r = await call("POST", "/api/auth/request", { email: "sr.reg@livotec.vn", password: "saimk123" });
  ok(r.s === 400, "đăng nhập sai mật khẩu vẫn bị từ chối");
  console.log("\n" + pass + " đạt, " + fail + " lỗi"); process.exit(fail ? 1 : 0);
})();
