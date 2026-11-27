// Kiểm thử lịch sử thay đổi theo từng nhân sự (tab "Lịch sử thay đổi" ở Hồ sơ học tập).  node dev/test-personlog.js
process.env.STORAGE_MODE = "memory"; process.env.MAIL_MODE = "memory";
process.env.SESSION_SECRET = "dev-session-secret-dev-session-secret-1234"; process.env.ALLOWED_EMAIL_DOMAINS = "x.vn";
process.env.ADMIN_EMAILS = "admin@x.vn";
const quiz = require("../api/_lib/quiz"), session = require("../api/_lib/session");
const F = { admin: require("../api/kt-admin"), viewer: require("../api/kt-viewer") };
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? "PASS " : "FAIL ") + m); };
async function call(fn, method, query, body, as) {
  const ctx = { log: Object.assign(() => {}, { error: () => {} }), res: null };
  const headers = { "x-requested-with": "livotec" }; if (as) headers["x-sr-token"] = session.sessionValue(as);
  await F[fn](ctx, { method, headers, query: query || {}, body });
  return { s: ctx.res.status, j: ctx.res.body };
}
const A = (m, q, b) => call("admin", m, q, b, "admin@x.vn"), V = (m, q, b) => call("viewer", m, q, b, "loan@x.vn");
const H = async (code) => (await A("GET", { op: "personHistory", code })).j;
(async () => {
  await quiz.saveCandidates([{ code: "NV1", name: "Nguyễn A", email: "a@x.vn", manager: "Lê Thị Thanh Loan", segment: "gia_dung" }]);
  await A("POST", {}, { op: "saveViewer", email: "loan@x.vn", name: "Lê Thị Thanh Loan", scopes: "Lê Thị Thanh Loan" });

  let r = await A("POST", {}, { op: "addCandidates", rows: [{ code: "NV1", name: "Nguyễn Văn A", email: "a@x.vn", manager: "Lê Thị Thanh Loan", segment: "may_loc", phone: "0912345678", province: "Hà Nội" }] });
  ok(r.j.ok, "quản trị sửa qua form");
  let h = await H("NV1");
  ok(h.ok && h.items.length === 1, "có 1 dòng lịch sử");
  const e = h.items[0], f = (k) => e.changes.find((x) => x.f === k);
  ok(e.byName && e.by === "admin@x.vn" && e.role === "admin", "ghi đúng người sửa: " + e.byName);
  ok(f("name") && f("name").from === "Nguyễn A" && f("name").to === "Nguyễn Văn A", "họ tên cũ → mới");
  ok(f("segment") && f("segment").from === "Gia dụng" && f("segment").to === "Máy lọc nước", "nhóm ngành cũ → mới");
  ok(f("phone") && f("phone").to === "0912345678", "số điện thoại mới");

  r = await V("POST", {}, { op: "updateEmployee", code: "NV1", email: "a2@x.vn" });
  ok(r.j.ok, "quản lí sửa email");
  r = await V("POST", {}, { op: "confirmEmployee", code: "NV1" });
  r = await V("POST", {}, { op: "setEmployment", code: "NV1", left: true });
  h = await H("NV1");
  ok(h.items.length === 4, "4 dòng sau khi quản lí sửa, xác nhận, báo nghỉ (" + h.items.length + ")");
  ok(h.items.some((x) => x.byName === "Lê Thị Thanh Loan" && x.changes.some((c) => c.f === "email" && c.to === "a2@x.vn")), "email đổi bởi quản lí");
  ok(h.items.some((x) => x.events.some((v) => /Xác nhận thông tin/.test(v))), "có dòng xác nhận thông tin");
  ok(h.items[0].changes.some((c) => c.f === "left" && c.to === "Đã nghỉ việc"), "mới nhất: đổi tình trạng → đã nghỉ");

  r = await A("POST", {}, { op: "renameCandidate", from: "NV1", to: "NV9" });
  ok(r.j.ok, "đổi mã NV");
  h = await H("NV9");
  ok(h.items.length === 5 && h.items[0].changes.some((c) => c.f === "code" && c.from === "NV1"), "lịch sử nối qua mã cũ sau khi đổi mã (" + h.items.length + ")");

  await A("POST", {}, { op: "deleteCandidate", code: "NV9" });
  h = await H("NV9");
  ok(h.items[0].kind === "delete", "ghi lại việc xoá khỏi danh sách");
  r = await call("admin", "GET", { op: "personHistory", code: "NV9" }, null, "loan@x.vn");
  ok(r.s === 403, "quản lí không xem được API lịch sử của quản trị");
  console.log("\n" + pass + " đạt, " + fail + " lỗi"); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
