// Kiểm thử gửi email nhắc việc từ ASM (chạy với dev/server.js ở chế độ MAIL_MODE=memory, sau dev/seed-demo.js).
const BASE = process.env.BASE || "http://localhost:7071", H = { "Content-Type": "application/json", "X-Requested-With": "livotec" };
const mailbox = async () => (await fetch(BASE + "/__mailbox")).json();
function client() { const c = { token: "" };
  c.call = async (m, p, b) => { const r = await fetch(BASE + p, { method: m, headers: Object.assign({}, H, c.token ? { "X-SR-Token": c.token } : {}), body: b ? JSON.stringify(b) : undefined }); let j = {}; try { j = await r.json(); } catch (e) {} return { s: r.status, j }; };
  c.login = async (email, name) => { let r = await c.call("POST", "/api/auth/request", { email, password: "matkhau123", name, phone: "0901234567" });
    if (r.j.needsOtp) { const m = (await mailbox()).filter((x) => x.to === email).pop(); r = await c.call("POST", "/api/auth/request", { email, password: "matkhau123", name, phone: "0901234567", otp: (m.subject.match(/(\d{6})/) || [])[1] }); }
    c.token = r.j.token; return c; }; return c; }
(async () => {
  const ok = (n, c) => console.log((c ? "PASS " : "FAIL ") + n);
  const asm1 = await client().login("asm@livotec.vn", "Trần Minh Quân");
  const asm2 = await client().login("asm2@livotec.vn", "ASM Hai");
  const admin = await client().login("boss@livotec.vn", "Admin");
  await admin.call("POST", "/api/org", { op: "addAsm", email: "asm2@livotec.vn", name: "ASM Hai", nganh: [1, 2] });
  const t = await asm1.call("GET", "/api/team"), mine = t.j.members.map((m) => m.uid), today = t.j.today;
  const before = (await mailbox()).length;
  const r = await asm1.call("POST", "/api/directive", { op: "send", to: mine.slice(0, 3), text: "Nhắc gửi báo cáo trước 19h <b>nhé</b>", date: today, kind: "note", email: true });
  const box = (await mailbox()).slice(before);
  ok("gửi 3 người, email.sent = 3 (" + JSON.stringify(r.j.email) + ")", r.s === 200 && r.j.email && r.j.email.sent === 3);
  ok("hòm thư thử nhận 3 email", box.length === 3);
  ok("email nội dung bị thoát HTML (không chèn thẻ)", box.every((m) => m.html.indexOf("<b>nhé</b>") < 0 && m.html.indexOf("&lt;b&gt;") >= 0));
  ok("Reply-To là email ASM", box.every((m) => m.headers && m.headers["Reply-To"] === "asm@livotec.vn"));
  const noMail = await asm1.call("POST", "/api/directive", { op: "send", to: mine.slice(0, 1), text: "Không gửi email", date: today, kind: "focus" });
  ok("không bật email thì không gửi (email = null)", noMail.j.email === null && (await mailbox()).length === before + 3);
  const o = await asm2.call("POST", "/api/directive", { op: "send", to: mine.slice(0, 2), text: "trái quyền", date: today, kind: "note", email: true });
  ok("ASM khác không gửi được email cho SR của ASM1 (" + o.s + ")", o.s === 400 && (await mailbox()).length === before + 3);
  const mix = await asm1.call("POST", "/api/directive", { op: "send", to: [mine[0], "0123456789abcdef0123456789abcdef"], text: "uid lạ", date: today, kind: "note", email: true });
  ok("uid lạ bị bỏ qua, chỉ gửi email 1 người", mix.j.email && mix.j.email.sent === 1);
})();
