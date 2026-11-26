// Kiểm thử link xác nhận nhân sự theo quản lí, có thời hạn:  node dev/test-worklink.js
process.env.STORAGE_MODE = "memory"; process.env.MAIL_MODE = "memory";
process.env.SESSION_SECRET = "dev-session-secret-dev-session-secret-1234"; process.env.ALLOWED_EMAIL_DOMAINS = "x.vn";
process.env.ADMIN_EMAILS = "admin@x.vn";
const quiz = require("../api/_lib/quiz"), session = require("../api/_lib/session"), W = require("../api/_lib/worklink");
const fn = require("../api/kt-worklink");
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? "PASS " : "FAIL ") + m); };
async function call(method, query, body, as, token) {
  const ctx = { log: Object.assign(() => {}, { error: () => {} }), res: null };
  const headers = { "x-requested-with": "livotec" }; if (as) headers["x-sr-token"] = session.sessionValue(as); if (token) headers["x-link-token"] = token;
  await fn(ctx, { method, headers, query: query || {}, body });
  return { s: ctx.res.status, j: ctx.res.body };
}
const day = (n) => new Date(Date.now() + 7 * 3600e3 + n * 86400e3).toISOString().slice(0, 10);
(async () => {
  await quiz.saveCandidates([
    { code: "L1", name: "An", email: "a@x.vn", manager: "Lê Thị Thanh Loan" },
    { code: "L2", name: "Bình", email: "b@x.vn", manager: "lê thị thanh loan" },
    { code: "T1", name: "Chi", email: "c@x.vn", manager: "Nguyễn Thu Thảo" }]);

  let r = await call("GET", { op: "links" }, null, "admin@x.vn");
  ok(r.j.ok && r.j.managers.length === 2 && r.j.managers.find((m) => /Loan/.test(m.name)).count === 2, "quản trị thấy 2 quản lí (Loan 2 người, Thảo 1 người)");
  r = await call("GET", { op: "links" }, null, "nv@x.vn"); ok(r.s === 403, "không phải quản trị: không xem/tạo link");
  r = await call("POST", {}, { op: "create", manager: "Lê Thị Thanh Loan", until: day(7) }, "nv@x.vn"); ok(r.s === 403, "không phải quản trị: không tạo được link");
  r = await call("POST", {}, { op: "create", manager: "Ai Đó", until: day(7) }, "admin@x.vn"); ok(r.s === 400, "quản lí không có nhân viên: từ chối");
  r = await call("POST", {}, { op: "create", manager: "Lê Thị Thanh Loan", until: day(-1) }, "admin@x.vn"); ok(r.s === 400, "ngày hết hạn đã qua: từ chối");
  r = await call("POST", {}, { op: "create", manager: "Lê Thị Thanh Loan", until: day(120) }, "admin@x.vn"); ok(r.s === 400, "quá 90 ngày: từ chối");
  const loan = (await call("POST", {}, { op: "create", manager: "Lê Thị Thanh Loan", until: day(7) }, "admin@x.vn")).j.link;
  const thao = (await call("POST", {}, { op: "create", manager: "Nguyễn Thu Thảo", until: day(0) }, "admin@x.vn")).j.link;
  ok(loan && loan.state === "active" && thao && thao.state === "active", "tạo link cho Loan (7 ngày) và Thảo (hết hôm nay)");

  r = await call("GET", {}, null, null, loan.token);
  ok(r.j.ok && r.j.employees.length === 2 && r.j.link.manager === "Lê Thị Thanh Loan", "mở link Loan không cần đăng nhập: thấy đúng 2 nhân viên của Loan");
  r = await call("GET", {}, null, null, thao.token); ok(r.j.ok && r.j.employees.length === 1 && r.j.employees[0].code === "T1", "link Thảo chỉ thấy nhân viên của Thảo");
  r = await call("POST", {}, { code: "L2", left: true }, null, loan.token);
  let c = (await quiz.getCandidates()).find((x) => x.code === "L2");
  ok(r.j.ok && c.left && c.work.byName === "Lê Thị Thanh Loan (qua link)", "bấm Đã nghỉ qua link: lưu + ghi 'qua link'");
  r = await call("POST", {}, { code: "T1", left: true }, null, loan.token); ok(r.s === 404, "link Loan KHÔNG bấm được nhân viên của Thảo");
  r = await call("POST", {}, { code: "L2", clear: true }, null, loan.token); ok(r.j.ok && !(await quiz.getCandidates()).find((x) => x.code === "L2").left, "hoàn tác qua link");
  r = await call("GET", {}, null, null, "x".repeat(32)); ok(r.s === 404, "mã link bịa: từ chối");

  // Hết hạn
  const L = await W.getLinks(); L.find((x) => x.id === thao.id).exp = Date.now() - 1000; await W.saveLinks(L);
  r = await call("GET", {}, null, null, thao.token); ok(r.s === 410 && r.j.expired && /hết hạn/.test(r.j.error), "link hết hạn: báo hết hạn");
  r = await call("POST", {}, { code: "T1", left: true }, null, thao.token); ok(r.s === 410, "link hết hạn: không bấm được");
  // Thu hồi
  r = await call("POST", {}, { op: "revoke", id: loan.id }, "admin@x.vn"); ok(r.j.ok && r.j.link.state === "revoked", "quản trị thu hồi link Loan");
  r = await call("GET", {}, null, null, loan.token); ok(r.s === 410 && /thu hồi/.test(r.j.error), "link đã thu hồi: không mở được");
  r = await call("GET", { op: "links" }, null, "admin@x.vn");
  ok(r.j.links.map((l) => l.state).join(",") === "expired,revoked", "danh sách link hiện đúng trạng thái");

  console.log("\n" + pass + " đạt, " + fail + " lỗi"); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
