// Kiểm thử API với máy chủ chạy thử. Chạy:  node dev/server.js &  rồi  node dev/test-api.js
const BASE = process.env.BASE || "http://localhost:7071";
process.env.SESSION_SECRET = process.env.SESSION_SECRET || "dev-session-secret-dev-session-secret-1234"; // cùng khoá với dev/server.js
const H = { "Content-Type": "application/json", "X-Requested-With": "livotec" };
let cookie = "", token = "", pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? "PASS " : "FAIL ") + m); };
async function call(method, p, body, extra) {
  const r = await fetch(BASE + p, { method, headers: Object.assign({}, H, cookie ? { Cookie: cookie } : {}, token ? { "X-SR-Token": token } : {}, extra || {}), body: body ? JSON.stringify(body) : undefined });
  const sc = r.headers.get("set-cookie"); if (sc) cookie = sc.indexOf("Max-Age=0") >= 0 ? "" : sc.split(";")[0];
  let j = null; const t = await r.text(); try { j = JSON.parse(t); } catch (e) { j = t; }
  if (j && j.token) token = j.token;
  return { s: r.status, j };
}
const mailbox = async () => (await fetch(BASE + "/__mailbox")).json();

(async () => {
  let r = await call("GET", "/api/auth/me"); ok(r.j.avail === true && r.j.loggedIn === false, "me: bật, chưa đăng nhập");
  r = await call("POST", "/api/auth/request", { email: "x@gmail.com" }, { "X-Requested-With": "" }); ok(r.s === 400, "request thiếu header chống CSRF bị từ chối");
  r = await call("POST", "/api/auth/request", { email: "khong-hop-le" }); ok(r.s === 400, "email sai định dạng bị từ chối");
  r = await call("POST", "/api/auth/request", { email: "ai-do@gmail.com" }); ok(r.s === 200 && (await mailbox()).length === 0, "email ngoài danh sách: trả lời chung, KHÔNG gửi thư");
  r = await call("POST", "/api/auth/request", { email: "Sale.A@Livotec.vn" }); ok(r.s === 200, "email được phép: 200");
  let mb = await mailbox(); ok(mb.length === 1 && mb[0].to === "sale.a@livotec.vn", "đã gửi 1 thư mã tới đúng người");
  const code = (mb[0].subject.match(/(\d{6})/) || [])[1]; ok(!!code, "thư có mã 6 số");
  r = await call("POST", "/api/auth/request", { email: "sale.a@livotec.vn" }); ok(r.s === 429, "gửi lại trong 30 giây bị chặn");
  r = await call("POST", "/api/auth/verify", { email: "sale.a@livotec.vn", code: code === "000000" ? "111111" : "000000" }); ok(r.s === 400 && !cookie, "mã sai: từ chối, không có cookie");
  r = await call("POST", "/api/auth/verify", { email: "sale.a@livotec.vn", code }); ok(r.s === 200 && /sr_session=/.test(cookie), "mã đúng: đăng nhập + cookie phiên");
  r = await call("POST", "/api/auth/verify", { email: "sale.a@livotec.vn", code }); ok(r.s === 400, "mã dùng một lần: dùng lại bị từ chối");
  r = await call("GET", "/api/auth/me"); ok(r.j.loggedIn === true && r.j.email === "sale.a@livotec.vn", "me: đã đăng nhập");

  const state = { month: "2026-10", target: { bn: 250, gd: 100 }, savedAt: 1000 };
  r = await call("GET", "/api/sync"); ok(r.s === 200 && r.j.doc === null, "sync GET: chưa có dữ liệu");
  r = await call("POST", "/api/sync", { state, baseRev: 0 }, { "X-Requested-With": "" }); ok(r.s === 400, "sync POST thiếu header bị từ chối");
  r = await call("POST", "/api/sync", { state: "abc", baseRev: 0 }); ok(r.s === 400, "sync: state sai kiểu bị từ chối");
  r = await call("POST", "/api/sync", { state, baseRev: 0, prefs: { mail: { on: true } } }); ok(r.s === 200 && r.j.rev === 1, "sync POST: lưu lần đầu rev=1");
  r = await call("POST", "/api/sync", { state, baseRev: 0 }); ok(r.s === 409 && r.j.rev === 1, "sync POST với rev cũ: xung đột 409");
  r = await call("POST", "/api/sync", { state: Object.assign({}, state, { savedAt: 2000 }), baseRev: 1 }); ok(r.s === 200 && r.j.rev === 2, "sync POST đúng rev: rev=2");
  r = await call("POST", "/api/sync", { state, baseRev: 0, force: true }); ok(r.s === 200 && r.j.rev === 3, "sync force: ghi đè rev=3");
  r = await call("POST", "/api/sync", { state: { month: "2026-10", pad: "x".repeat(600000) }, baseRev: 3 }); ok(r.s === 413, "sync: dữ liệu quá lớn bị chặn");
  r = await call("GET", "/api/sync"); ok(r.j.doc && r.j.doc.rev === 3 && r.j.doc.state.target.bn === 250, "sync GET: đọc lại đúng dữ liệu");

  // Phiên qua header X-SR-Token (không cookie)
  const savedCookie = cookie, savedToken = token; cookie = "";
  r = await call("GET", "/api/auth/me"); ok(r.j.loggedIn === true, "me: đăng nhập chỉ bằng header X-SR-Token");
  token = savedToken.slice(0, -2) + "xx"; r = await call("GET", "/api/sync"); ok(r.s === 401, "token bị sửa: bị từ chối");
  token = savedToken; cookie = savedCookie;

  // người dùng khác không thấy dữ liệu của nhau
  const saved = cookie, savedTok2 = token; cookie = ""; token = "";
  r = await call("GET", "/api/sync"); ok(r.s === 401, "chưa đăng nhập: không đọc được dữ liệu (401)");
  await call("POST", "/api/auth/request", { email: "sale.b@livotec.vn" });
  mb = await mailbox(); const codeB = (mb[mb.length - 1].subject.match(/(\d{6})/) || [])[1];
  await call("POST", "/api/auth/verify", { email: "sale.b@livotec.vn", code: codeB });
  r = await call("GET", "/api/sync"); ok(r.s === 200 && r.j.doc === null, "người dùng B không thấy dữ liệu của A");
  token = ""; cookie = saved + "x"; r = await call("GET", "/api/sync"); ok(r.s === 401, "cookie bị sửa: bị từ chối");
  cookie = saved; token = savedTok2;

  // thư thử
  r = await call("POST", "/api/mail/test", {}); ok(r.s === 200, "gửi email thử");
  // Tắt email từ liên kết trong thư
  const sess = require("../api/_lib/session");
  const uid = sess.uidOf("sale.a@livotec.vn");
  r = await fetch(BASE + "/api/mail/unsub?t=" + encodeURIComponent("bad.token")); ok(r.status === 400, "liên kết huỷ sai: 400");
  r = await fetch(BASE + "/api/mail/unsub?t=" + encodeURIComponent(sess.unsubToken(uid))); ok(r.status === 200, "liên kết huỷ đúng: 200");
  r = await call("GET", "/api/sync"); ok(r.j.mailOff === true, "sync báo mailOff sau khi huỷ");
  r = await call("POST", "/api/sync", { state, baseRev: 3, prefs: { mail: { on: true } } }); ok(r.s === 200, "đồng bộ lại");
  // Cron
  r = await call("POST", "/api/cron", {}); ok(r.s === 401, "cron không có khoá: 401");
  r = await call("POST", "/api/cron", {}, { "x-cron-secret": "sai" }); ok(r.s === 401, "cron sai khoá: 401");

  // ---- Lịch gửi email (cron) ----
  const CR = { "x-cron-secret": process.env.CRON_SECRET || "dev-cron-secret-1234567890" };
  const cron = (iso) => call("POST", "/api/cron", {}, Object.assign({ "x-test-now": iso }, CR));
  const days = {}; for (let d = 1; d <= 31; d++) { const k = "2026-10-" + String(d).padStart(2, "0"); const dow = new Date(k + "T00:00:00Z").getUTCDay(); days[k] = dow === 0 ? { o: 1 } : { si: 12, vt: 3 }; }
  const digest = { month: "2026-10", total: 350, days, daily: { "2026-10-07": { v: 5, bn: 12, gd: 8 } }, alerts: [], fx: null };
  const prefs = { mail: { on: true, morning: true, evening: true, warn: true, weekly: true }, times: { m: "08:00", e: "20:00", a: "21:30" } };
  r = await call("POST", "/api/sync", { state, digest, prefs, baseRev: 4, ackMailOff: true }); ok(r.s === 200, "đẩy digest + bật email (xác nhận đã huỷ trước đó)");
  const n0 = (await mailbox()).length;
  r = await cron("2026-10-08T00:50:00Z"); ok(r.j.sent === 0, "07:50 giờ VN: chưa tới giờ, không gửi");
  r = await cron("2026-10-08T01:05:00Z"); ok(r.j.sent === 1, "08:05 thứ Năm: gửi 1 email buổi sáng");
  let m = (await mailbox()).slice(n0); const mm = m[m.length - 1] || {};
  ok(/^\[Tham khảo\] Kết quả hôm qua 07\/10: 20 tr \(167% kế hoạch ngày\)/.test(mm.subject || ""), "tiêu đề đúng: " + mm.subject);
  ok(/List-Unsubscribe/.test(JSON.stringify(mm.headers || {})) && /api\/mail\/unsub/.test(mm.html || ""), "có liên kết tắt email");
  r = await cron("2026-10-08T01:35:00Z"); ok(r.j.sent === 0, "gọi lại cùng buổi sáng: không gửi trùng");
  r = await cron("2026-10-08T13:10:00Z"); ok(r.j.sent === 1, "20:10: nhắc nhập số liệu (hôm nay chưa nhập)");
  m = (await mailbox()); ok(/^\[Nhắc\] Nhập số liệu/.test(m[m.length - 1].subject), "tiêu đề nhắc: " + m[m.length - 1].subject);
  r = await cron("2026-10-08T14:40:00Z"); ok(r.j.sent === 0, "21:40: không nhắc lại lần hai trong ngày");
  r = await cron("2026-10-11T13:10:00Z"); ok(r.j.sent === 0, "Chủ nhật 20:10 (ngày nghỉ): không nhắc");
  r = await cron("2026-10-12T01:05:00Z"); ok(r.j.sent === 1, "Thứ Hai 08:05: gửi tổng kết tuần (hôm qua là Chủ nhật nghỉ)");
  m = (await mailbox()); ok(/Tổng kết tuần 05\/10–11\/10/.test(m[m.length - 1].subject) && !/Kết quả hôm qua/.test(m[m.length - 1].html), "chỉ có tổng kết tuần, không có 'kết quả hôm qua': " + m[m.length - 1].subject);
  // Đã nhập hôm nay -> không nhắc tối
  const d2 = JSON.parse(JSON.stringify(digest)); d2.daily["2026-10-13"] = { v: 4, bn: 5, gd: 0 };
  r = await call("GET", "/api/sync"); r = await call("POST", "/api/sync", { state, digest: d2, prefs, baseRev: r.j.doc.rev }); ok(r.s === 200, "đẩy digest đã có số liệu 13/10");
  const n1 = (await mailbox()).length; r = await cron("2026-10-13T13:10:00Z"); ok(r.j.sent === 0 && (await mailbox()).length === n1, "đã nhập hôm nay: không nhắc tối");
  // Cảnh báo
  const d3 = JSON.parse(JSON.stringify(d2)); d3.alerts = [{ lv: "bad", t: "Làm ít hơn kế hoạch", x: "Tuần này mới đạt 40%" }]; d3.fx = { v: "", rows: [{ lv: "bad", n: "Độ phủ điểm bán", m: "Cần ghé 22 điểm, chỉ có 10", a: "Mở thêm 12 điểm" }] };
  r = await call("GET", "/api/sync"); r = await call("POST", "/api/sync", { state, digest: d3, prefs, baseRev: r.j.doc.rev });
  const n2 = (await mailbox()).length; r = await cron("2026-10-14T01:05:00Z"); m = (await mailbox());
  ok(r.j.sent === 1 && /^\[Cảnh báo\] Làm ít hơn kế hoạch và 1 mục khác/.test(m[m.length - 1].subject), "cảnh báo rủi ro cao: " + m[m.length - 1].subject);
  r = await cron("2026-10-15T01:05:00Z"); m = (await mailbox()); ok(!/Cảnh báo/.test((m[m.length - 1] || {}).html || "") || m.length === n2 + 1 || !/CẢNH BÁO/.test(m[m.length - 1].html), "ngày sau, cùng cảnh báo: không lặp lại ngay");
  // Tắt email -> không gửi
  const p2 = JSON.parse(JSON.stringify(prefs)); p2.mail.on = false;
  r = await call("GET", "/api/sync"); await call("POST", "/api/sync", { state, digest: d3, prefs: p2, baseRev: r.j.doc.rev });
  const n3 = (await mailbox()).length; r = await cron("2026-10-16T13:10:00Z"); ok(r.j.sent === 0 && (await mailbox()).length === n3, "đã tắt email: không gửi gì");
  console.log(`\nKết quả: ${pass} đạt, ${fail} lỗi`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
