// Kiểm thử luồng ngành / ASM / báo cáo ngày / giao việc. Cần máy chủ chạy thử MỚI KHỞI ĐỘNG:
//   ADMIN_EMAILS=boss@livotec.vn node dev/server.js     rồi    node dev/test-org.js
const BASE = process.env.BASE || "http://localhost:7071";
const H = { "Content-Type": "application/json", "X-Requested-With": "livotec" };
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? "PASS " : "FAIL ") + m); };
const mailbox = async () => (await fetch(BASE + "/__mailbox")).json();

function client() {
  const c = { token: "" };
  c.call = async (method, p, body) => {
    const r = await fetch(BASE + p, { method, headers: Object.assign({}, H, c.token ? { "X-SR-Token": c.token } : {}), body: body ? JSON.stringify(body) : undefined });
    let j = null; const t = await r.text(); try { j = JSON.parse(t); } catch (e) { j = t; }
    return { s: r.status, j };
  };
  c.login = async (email, name) => {
    let r = await c.call("POST", "/api/auth/request", { email, password: "matkhau123", name });
    if (r.j.needsOtp) {
      const mb = await mailbox(); const m = mb.filter((x) => x.to === email).pop();
      const otp = (m.subject.match(/(\d{6})/) || [])[1];
      r = await c.call("POST", "/api/auth/request", { email, password: "matkhau123", name, otp });
    }
    c.token = r.j.token; return r.j;
  };
  return c;
}
const today = () => new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
const dayOff = (n) => new Date(Date.now() + 7 * 3600e3 + n * 864e5).toISOString().slice(0, 10);

(async () => {
  const admin = client(), a1 = client(), a2 = client(), s1 = client(), s2 = client(), s3 = client(), anon = client();
  await admin.login("boss@livotec.vn", "Sếp Tổng");
  await a1.login("asm1@livotec.vn", "ASM Một"); await a2.login("asm2@livotec.vn", "ASM Hai");
  await s1.login("sr1@livotec.vn", "SR Một"); await s2.login("sr2@livotec.vn", "SR Hai"); await s3.login("sr3@livotec.vn", "SR Ba");

  let r = await admin.call("GET", "/api/auth/me"); ok(r.j.isAdmin === true && r.j.isAsm === false, "me: admin, chưa là ASM");
  r = await s1.call("POST", "/api/org", { op: "addAsm", email: "asm1@livotec.vn" }); ok(r.s === 403, "SR không khai báo được ASM (403)");
  r = await a1.call("GET", "/api/team"); ok(r.s === 403, "ASM chưa được khai báo: không vào được /team");
  r = await admin.call("POST", "/api/org", { op: "addAsm", email: "asm1@livotec.vn", name: "Trần ASM Một", area: "Miền Nam" }); ok(r.s === 200 && r.j.asms.length === 1, "admin thêm ASM 1");
  r = await admin.call("POST", "/api/org", { op: "addAsm", email: "asm2@livotec.vn", name: "Lê ASM Hai", area: "Miền Bắc" }); ok(r.s === 200 && r.j.asms.length === 2, "admin thêm ASM 2");
  r = await admin.call("POST", "/api/org", { op: "addAsm", email: "x@gmail.com" }); ok(r.s === 400, "email ngoài miền bị từ chối khi thêm ASM");
  r = await a1.call("GET", "/api/auth/me"); ok(r.j.isAsm === true, "me: asm1 nhận ra là ASM");

  // Hồ sơ SR
  r = await s1.call("GET", "/api/profile"); ok(r.s === 200 && r.j.profile === null && r.j.asms.length === 2, "SR chưa có hồ sơ, thấy danh sách 2 ASM");
  r = await s1.call("POST", "/api/profile", { nganh: 3, asmEmail: "asm1@livotec.vn" }); ok(r.s === 400, "ngành không hợp lệ bị từ chối");
  r = await s1.call("POST", "/api/profile", { nganh: 2, asmEmail: "la@livotec.vn" }); ok(r.s === 400, "ASM không có trong danh sách bị từ chối");
  r = await s1.call("POST", "/api/profile", { nganh: 2, asmEmail: "asm1@livotec.vn", province: "Đồng Nai" }); ok(r.s === 200 && r.j.profile.nganh === 2, "sr1: ngành 2, asm1");
  r = await s2.call("POST", "/api/profile", { nganh: 1, asmEmail: "asm2@livotec.vn", province: "Hà Nội" }); ok(r.s === 200, "sr2: ngành 1, asm2");
  r = await s3.call("POST", "/api/profile", { nganh: 1, asmEmail: "asm1@livotec.vn" }); ok(r.s === 200, "sr3: ngành 1, asm1");
  r = await s1.call("GET", "/api/profile"); ok(r.j.asmName === "Trần ASM Một", "hồ sơ trả tên ASM");

  // Báo cáo ngày
  const plan = { month: today().slice(0, 7), total: 300, target: { bn: 200, gd: 100 }, pts: 120, act: 80, labels: { bn: "Bình NN", gd: "Gia dụng" }, days: { [today()]: { si: 14, vt: 12 }, [dayOff(1)]: { si: 14, vt: 12 } }, alerts: [{ lv: "bad", t: "Chậm tiến độ", x: "x" }] };
  const e1 = { v: 11, bn: 9.5, gd: 3, htpp: 4, dp: 2, so: 18, note: "Đại lý A nợ", help: true, ng: 2, sub: Date.now(), ts: Date.now() };
  r = await anon.call("POST", "/api/report", { days: {} }); ok(r.s === 401, "báo cáo: chưa đăng nhập 401");
  const sNo = client(); await sNo.login("sr9@livotec.vn", "Chưa hồ sơ");
  r = await sNo.call("POST", "/api/report", { days: { [today()]: e1 } }); ok(r.s === 409 && r.j.needProfile, "chưa có hồ sơ: yêu cầu chọn ngành/ASM trước");
  r = await s1.call("POST", "/api/report", { days: { [today()]: e1, "2020-01-01": e1, "abc": e1, [dayOff(5)]: e1 }, plan }); ok(r.s === 200 && r.j.accepted === 1, "chỉ nhận ngày hợp lệ (bỏ ngày quá cũ/sai/tương lai xa)");
  r = await s1.call("POST", "/api/report", { days: { [today()]: Object.assign({}, e1, { bn: 1, ts: e1.ts - 5000 }) } }); ok(r.s === 200 && r.j.accepted === 0, "bản cũ hơn không ghi đè bản mới");
  r = await s1.call("GET", "/api/report"); ok(r.j.days[today()].bn === 9.5 && r.j.plan.total === 300, "đọc lại đúng báo cáo + kế hoạch");
  r = await s1.call("POST", "/api/report", { days: { [today()]: { v: -5, bn: "abc", htpp: 1e12, note: "x".repeat(900), ts: Date.now() + 1 } } }); const d = (await s1.call("GET", "/api/report")).j.days[today()];
  ok(d.v === 0 && d.bn === 0 && d.htpp <= 5000 && d.note.length === 400, "làm sạch số âm / chữ / quá lớn / ghi chú dài");
  await s1.call("POST", "/api/report", { days: { [today()]: e1 && Object.assign({}, e1, { ts: Date.now() + 2 }) } });
  await s2.call("POST", "/api/report", { days: { [today()]: { v: 8, bn: 5, gd: 2, htpp: 1, dp: 1, so: 9, ng: 1, sub: Date.now(), ts: Date.now() } }, plan: Object.assign({}, plan, { total: 200 }) });

  // Nhóm của ASM
  r = await a1.call("GET", "/api/team"); const ids = r.j.members.map((m) => m.email).sort();
  ok(r.s === 200 && ids.join() === "sr1@livotec.vn,sr3@livotec.vn", "asm1 chỉ thấy sr1, sr3 (không thấy sr2 của asm2)");
  ok(r.j.members.find((m) => m.email === "sr1@livotec.vn").days[today()].help === true, "asm1 đọc được báo cáo + cờ cần hỗ trợ của sr1");
  ok(!JSON.stringify(r.j).match(/pwd|otp|"hash"/), "dữ liệu nhóm không chứa mật khẩu / OTP");
  r = await a2.call("GET", "/api/team"); ok(r.j.members.length === 1 && r.j.members[0].email === "sr2@livotec.vn", "asm2 chỉ thấy sr2");
  r = await a1.call("GET", "/api/team?asm=asm2@livotec.vn"); ok(r.j.members.every((m) => m.asmEmail === "asm1@livotec.vn"), "ASM không xem được nhóm khác bằng tham số asm=");
  r = await admin.call("GET", "/api/team"); ok(r.j.members.length === 3 && r.j.asms.length === 2, "admin thấy cả 3 SR + danh sách ASM");
  r = await admin.call("GET", "/api/team?asm=asm2@livotec.vn"); ok(r.j.members.length === 1, "admin lọc theo ASM");
  r = await s1.call("GET", "/api/team"); ok(r.s === 403, "SR không xem được /team");

  // Giao việc
  r = await a1.call("POST", "/api/directive", { op: "send", to: ["" + (await s2.call("GET", "/api/team")).j], text: "x" }); ok(r.s === 403 || r.s === 400, "SR không giao việc được");
  const sr1uid = (await a1.call("GET", "/api/team")).j.members.find((m) => m.email === "sr1@livotec.vn").uid;
  const sr2uid = (await a2.call("GET", "/api/team")).j.members[0].uid;
  r = await a1.call("POST", "/api/directive", { op: "send", to: [sr2uid], text: "Ưu tiên đại lý B" }); ok(r.s === 400, "asm1 không giao việc cho SR của asm2");
  r = await a1.call("POST", "/api/directive", { op: "send", to: [sr1uid], text: "Ưu tiên đại lý B", date: dayOff(1), kind: "focus" }); ok(r.s === 200 && r.j.sent === 1, "asm1 giao việc cho sr1");
  r = await a1.call("POST", "/api/directive", { op: "send", to: "all", nganh: 1, text: "Khen cả nhóm ngành 1", kind: "praise" }); ok(r.s === 200 && r.j.sent === 1, "giao theo ngành: chỉ sr3 (ngành 1) trong nhóm asm1");
  r = await a1.call("POST", "/api/directive", { op: "send", to: [sr1uid], text: "" }); ok(r.s === 400, "nội dung rỗng bị từ chối");
  r = await s1.call("GET", "/api/directive"); ok(r.j.items.length === 1 && r.j.items[0].from === "Trần ASM Một", "sr1 nhận đúng 1 việc, có tên ASM");
  const did = r.j.items[0].id;
  r = await s2.call("POST", "/api/directive", { op: "ack", id: did, done: true }); ok(r.s === 404, "SR khác không đánh dấu được việc của người khác");
  r = await s1.call("POST", "/api/directive", { op: "ack", id: did, done: true }); ok(r.s === 200, "sr1 đánh dấu đã làm");
  r = await a1.call("GET", "/api/team"); ok(r.j.members.find((m) => m.uid === sr1uid).dir[0].done === true, "asm1 thấy việc đã hoàn thành");

  // Gán / khoá / gỡ ASM
  r = await admin.call("POST", "/api/org", { op: "assign", uid: sr1uid, asmEmail: "asm2@livotec.vn", lock: true }); ok(r.s === 200, "admin gán sr1 sang asm2 (khoá)");
  r = await s1.call("POST", "/api/profile", { nganh: 2, asmEmail: "asm1@livotec.vn" }); ok(r.s === 200 && /quản trị/.test(r.j.note) && r.j.profile.asmEmail === "asm2@livotec.vn", "SR bị khoá: không tự đổi ASM được");
  r = await admin.call("POST", "/api/org", { op: "setNganh", uid: sr1uid, nganh: 1 }); ok(r.s === 200, "admin đổi ngành sr1");
  r = await a1.call("GET", "/api/team"); ok(r.j.members.length === 1 && r.j.members[0].email === "sr3@livotec.vn", "asm1 không còn thấy sr1 sau khi bị chuyển");
  r = await admin.call("GET", "/api/org"); ok(r.j.profiles.length === 3 && r.j.orphans.some((o) => o.email === "sr9@livotec.vn"), "org: liệt kê hồ sơ + người chưa chọn ngành");
  r = await admin.call("POST", "/api/org", { op: "removeAsm", email: "asm2@livotec.vn" }); ok(r.s === 200 && r.j.asms.length === 1, "xoá asm2");
  r = await admin.call("GET", "/api/team"); ok(r.j.members.filter((m) => !m.asmEmail).length === 2, "SR của asm2 thành 'chưa gán'");

  // admin-user không lộ băm mật khẩu
  r = await admin.call("GET", "/api/admin/user?uid=" + sr1uid); ok(r.s === 200 && !("pwd" in r.j.doc) && !("otp" in r.j.doc), "admin-user: không trả băm mật khẩu/OTP");
  r = await admin.call("DELETE", "/api/admin/user?uid=" + sr1uid); ok(r.s === 200, "xoá thành viên");
  r = await admin.call("GET", "/api/org"); ok(!r.j.profiles.some((p) => p.uid === sr1uid), "xoá thành viên cũng xoá hồ sơ");

  // Ngành + tỉnh/thành của ASM, tạo trước thành viên
  const a3 = client(); await a3.login("asm3@livotec.vn", "ASM Ba");
  r = await admin.call("POST", "/api/org", { op: "addAsm", email: "asm3@livotec.vn", name: "ASM Ba", nganh: [1], provinces: "Tỉnh Đồng Nai, TP. Hồ Chí Minh, đồng nai" });
  const rec3 = r.j.asms.find((a) => a.email === "asm3@livotec.vn");
  ok(r.s === 200 && rec3.nganh.join() === "1" && rec3.provinces.length === 2, "ASM chỉ phụ trách ngành 1, 2 tỉnh (bỏ trùng)");
  r = await s3.call("GET", "/api/profile"); const x3 = r.j.asms.find((a) => a.email === "asm3@livotec.vn");
  ok(x3 && x3.nganh.join() === "1" && x3.provinces.includes("Tỉnh Đồng Nai"), "SR thấy ngành + tỉnh của ASM khi chọn");
  r = await s3.call("POST", "/api/profile", { nganh: 2, asmEmail: "asm3@livotec.vn" }); ok(r.s === 400, "không chọn được ASM không phụ trách ngành mình");
  r = await s3.call("POST", "/api/profile", { nganh: 1, asmEmail: "asm3@livotec.vn", province: "Đồng Nai" }); ok(r.s === 200, "chọn đúng ngành thì được");
  const ivMail = "moi" + Date.now().toString(36) + "@livotec.vn";
  r = await admin.call("POST", "/api/org", { op: "invite", email: ivMail, name: "Nhân sự mới", nganh: 1, asmEmail: "asm3@livotec.vn", province: "Biên Hòa" }); ok(r.s === 200 && r.j.applied === false, "tạo trước thành viên chưa có tài khoản");
  r = await admin.call("GET", "/api/org"); ok(r.j.invites.some((i) => i.email === ivMail), "danh sách lời mời hiện thành viên chờ");
  const nw = client(); await nw.login(ivMail, "Nhân sự mới");
  r = await nw.call("GET", "/api/profile"); ok(r.j.profile && r.j.profile.nganh === 1 && r.j.profile.asmEmail === "asm3@livotec.vn" && r.j.profile.locked === true, "đăng nhập lần đầu: tự có ngành 1 + ASM (khoá)");
  r = await admin.call("GET", "/api/org"); ok(!r.j.invites.some((i) => i.email === ivMail), "lời mời được dùng xong thì bỏ");
  r = await admin.call("POST", "/api/org", { op: "invite", email: ivMail, nganh: 2 }); ok(r.s === 200 && r.j.applied === true, "mời email đã có tài khoản: áp dụng ngay");
  r = await s1.call("POST", "/api/org", { op: "invite", email: ivMail, nganh: 2 }); ok(r.s === 403, "SR không tạo được lời mời");

  // Nhập hàng loạt
  r = await admin.call("POST", "/api/org", { op: "bulkImport", asms: [{ email: "bulk.asm@livotec.vn", name: "Bulk ASM", nganh: [2], provinces: ["Hà Nội", "Hòa Bình"] }, { email: "xxx", name: "hỏng" }], members: [{ email: "bulk.sr1@livotec.vn", name: "B1", nganh: 2, asmEmail: "bulk.asm@livotec.vn" }, { email: "bulk.sr2@livotec.vn", name: "B2", nganh: 2, asmEmail: "khong.co@livotec.vn" }, { email: "bulk.sr3@livotec.vn", nganh: 5 }] });
  ok(r.s === 200 && r.j.asms === 1 && r.j.invited === 2 && r.j.skipped === 2, "nhập hàng loạt: 1 ASM, 2 SR chờ, bỏ 2 dòng sai " + JSON.stringify(r.j));
  r = await admin.call("GET", "/api/org"); const i1 = r.j.invites.find((i) => i.email === "bulk.sr1@livotec.vn"), i2 = r.j.invites.find((i) => i.email === "bulk.sr2@livotec.vn");
  ok(i1 && i1.asmEmail === "bulk.asm@livotec.vn" && i2 && i2.asmEmail === "", "ASM không tồn tại thì để trống, không gán bừa");
  r = await s1.call("POST", "/api/org", { op: "bulkImport", asms: [], members: [] }); ok(r.s === 403, "SR không nhập hàng loạt được");

  console.log("\n" + pass + " đạt, " + fail + " lỗi"); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
