// Kiểm thử quyền quản trị trên tài khoản thành viên: đổi email (di chuyển dữ liệu), sửa họ tên + SĐT.
// Chạy với dev/server.js (ADMIN_EMAILS=boss@livotec.vn) vừa khởi động.
const BASE = process.env.BASE || "http://localhost:7071", H = { "Content-Type": "application/json", "X-Requested-With": "livotec" };
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? "PASS " : "FAIL ") + m); };
const call = async (m, p, b, tok) => { const r = await fetch(BASE + p, { method: m, headers: Object.assign({}, H, tok ? { "X-SR-Token": tok } : {}), body: b ? JSON.stringify(b) : undefined }); let j = {}; try { j = await r.json(); } catch (e) {} return { s: r.status, j }; };
const mailbox = async () => (await fetch(BASE + "/__mailbox")).json();
const login = async (email, name, pw) => { const body = { email, password: pw || "matkhau123", name, phone: "0901234567" }; let r = await call("POST", "/api/auth/request", body); if (r.j.needsOtp) { const m = (await mailbox()).filter((x) => x.to === email).pop(); r = await call("POST", "/api/auth/request", Object.assign({}, body, { otp: (m.subject.match(/(\d{6})/) || [])[1] })); } return r.j.token; };
const today = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10), month = today.slice(0, 7);
(async () => {
  const admin = await login("boss@livotec.vn", "Quản Trị Viên");
  await call("POST", "/api/org", { op: "addAsm", email: "asm@livotec.vn", name: "Quản Lý Một", area: "x" }, admin);
  const asm = await login("asm@livotec.vn", "Quản Lý Một");
  const sr = await login("sr.cu@livotec.vn", "Nguyễn Văn Cũ");
  await call("POST", "/api/profile", { nganh: 2, asmEmail: "asm@livotec.vn", province: "Đồng Nai" }, sr);
  await call("POST", "/api/report", { days: { [today]: { v: 3, bn: 5, gd: 4, note: "ghi chú gốc" } }, plan: { month, total: 100 } }, sr);
  let t = await call("GET", "/api/team", null, asm);
  const old = t.j.members.find((x) => x.email === "sr.cu@livotec.vn");
  await call("POST", "/api/directive", { op: "send", to: [old.uid], text: "Việc giao trước khi đổi email", date: today, kind: "focus" }, asm);
  const oldUid = old.uid;

  // ---- các trường hợp bị chặn
  let r = await call("POST", "/api/org", { op: "changeEmail", uid: oldUid, email: "khong-hop-le" }, admin);
  ok(r.s === 400 && r.j.field === "email", "email không hợp lệ -> 400");
  r = await call("POST", "/api/org", { op: "changeEmail", uid: oldUid, email: "sr.cu@livotec.vn" }, admin);
  ok(r.s === 400, "email trùng email hiện tại -> 400");
  r = await call("POST", "/api/org", { op: "changeEmail", uid: oldUid, email: "ai.do@gmail.com" }, admin);
  ok(r.s === 400 && /ALLOWED/.test(r.j.error), "tên miền không được phép -> 400");
  r = await call("POST", "/api/org", { op: "changeEmail", uid: oldUid, email: "boss@livotec.vn" }, admin);
  ok(r.s === 400 || r.s === 409, "trùng email quản trị viên/ đã có tài khoản bị chặn (" + r.s + ")");
  const other = await login("sr.khac@livotec.vn", "Trần Văn Khác");
  r = await call("POST", "/api/org", { op: "changeEmail", uid: oldUid, email: "sr.khac@livotec.vn" }, admin);
  ok(r.s === 409, "email đã có tài khoản khác -> 409");
  const adminUid = (await call("GET", "/api/org", null, admin)).j.me;
  r = await call("POST", "/api/org", { op: "changeEmail", uid: adminUid, email: "boss2@livotec.vn" }, admin);
  ok(r.s === 400, "không tự đổi email của chính mình -> 400");
  r = await call("POST", "/api/org", { op: "changeEmail", uid: oldUid, email: "sr.moi@livotec.vn" }, asm);
  ok(r.s === 403, "ASM không có quyền đổi email -> 403");

  // ---- đổi email thành công + dữ liệu đi theo
  r = await call("POST", "/api/org", { op: "changeEmail", uid: oldUid, email: "  SR.Moi@Livotec.vn " }, admin);
  ok(r.s === 200 && r.j.email === "sr.moi@livotec.vn" && r.j.uid && r.j.uid !== oldUid, "đổi email thành công (chuẩn hoá chữ thường, uid mới)");
  const newUid = r.j.uid;
  r = await call("GET", "/api/team", null, asm);
  const m = (r.j.members || []).find((x) => x.email === "sr.moi@livotec.vn");
  ok(m && m.uid === newUid, "ASM thấy nhân sự với email mới");
  ok(m && !(r.j.members || []).some((x) => x.email === "sr.cu@livotec.vn"), "email cũ không còn trong nhóm");
  ok(m && m.name === "Nguyễn Văn Cũ" && m.phone === "0901234567" && m.province === "Đồng Nai", "họ tên, SĐT, tỉnh giữ nguyên");
  ok(m && m.days && m.days[today] && m.days[today].note === "ghi chú gốc", "báo cáo ngày giữ nguyên");
  ok(m && (m.dir || []).some((d) => /trước khi đổi email/.test(d.text)), "việc đã giao giữ nguyên");
  ok(m && m.asmEmail === "asm@livotec.vn", "vẫn thuộc ASM cũ");
  r = await call("GET", "/api/team", null, sr);
  ok(r.s === 401 || r.s === 403, "phiên đăng nhập cũ bị vô hiệu (" + r.s + ")");
  r = await call("GET", "/api/admin/user?uid=" + oldUid, null, admin);
  ok(r.s === 404, "dữ liệu cũ đã được dọn (uid cũ 404)");
  r = await call("POST", "/api/auth/request", { email: "sr.moi@livotec.vn", password: "matkhau123" });
  ok(r.s === 200 && r.j.token, "đăng nhập bằng email mới + mật khẩu cũ được");
  const sr2 = r.j.token;
  r = await call("POST", "/api/auth/request", { email: "sr.cu@livotec.vn", password: "matkhau123" });
  ok(r.s === 400 && !r.j.token, "email cũ không đăng nhập được nữa");
  r = await call("GET", "/api/auth/me", null, sr2);
  ok(r.j.loggedIn && r.j.email === "sr.moi@livotec.vn" && r.j.contactOk === true && r.j.profile && r.j.profile.asmEmail === "asm@livotec.vn", "auth/me với email mới đầy đủ hồ sơ + ASM");

  // ---- đổi email của một ASM: nhóm của họ đi theo
  const orgv = (await call("GET", "/api/org", null, admin)).j;
  const asmUid = (orgv.orphans.concat(orgv.profiles)).find((x) => x.email === "asm@livotec.vn").uid;
  r = await call("POST", "/api/org", { op: "changeEmail", uid: asmUid, email: "asm.moi@livotec.vn" }, admin);
  ok(r.s === 200, "đổi email của ASM thành công");
  const o2 = (await call("GET", "/api/org", null, admin)).j;
  ok(o2.asms.some((a) => a.email === "asm.moi@livotec.vn") && !o2.asms.some((a) => a.email === "asm@livotec.vn"), "danh sách ASM cập nhật email mới");
  ok(o2.profiles.filter((p) => p.asmEmail === "asm.moi@livotec.vn").length === 1, "nhân sự của ASM chuyển sang email ASM mới");
  ok(!o2.profiles.some((p) => p.asmEmail === "asm@livotec.vn"), "không còn nhân sự trỏ về email ASM cũ");
  const asm2 = await call("POST", "/api/auth/request", { email: "asm.moi@livotec.vn", password: "matkhau123" });
  t = await call("GET", "/api/team", null, asm2.j.token);
  ok(t.s === 200 && (t.j.members || []).length === 1 && t.j.members[0].email === "sr.moi@livotec.vn", "ASM đăng nhập email mới vẫn thấy nhóm (" + ((t.j.members || []).length) + " người)");

  // ---- sửa họ tên + SĐT
  const uidMoi = (await call("GET", "/api/org", null, admin)).j.profiles.find((x) => x.email === "sr.moi@livotec.vn").uid;
  r = await call("POST", "/api/org", { op: "editMember", uid: uidMoi, name: "hvhwan", phone: "0901234567" }, admin);
  ok(r.s === 400 && r.j.field === "name", "sửa tên một từ -> 400");
  r = await call("POST", "/api/org", { op: "editMember", uid: uidMoi, name: "Nguyễn Văn Mới", phone: "123" }, admin);
  ok(r.s === 400 && r.j.field === "phone", "sửa SĐT sai -> 400");
  r = await call("POST", "/api/org", { op: "editMember", uid: uidMoi, name: "Nguyễn Văn Mới", phone: "+84 977 000 111", province: "Cần Thơ" }, admin);
  ok(r.s === 200, "admin sửa họ tên + SĐT + tỉnh");
  t = await call("GET", "/api/team", null, asm2.j.token);
  const m3 = (t.j.members || []).find((x) => x.email === "sr.moi@livotec.vn");
  ok(m3 && m3.name === "Nguyễn Văn Mới" && m3.phone === "0977000111" && m3.province === "Cần Thơ", "ASM thấy thông tin mới (" + (m3 && m3.name) + ", " + (m3 && m3.phone) + ")");
  console.log("\n" + pass + " đạt, " + fail + " lỗi"); process.exit(fail ? 1 : 0);
})();
